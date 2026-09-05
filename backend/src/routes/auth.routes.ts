import { Router } from "express";
import passport from "../config/passport";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const router = Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "reachinbox-development-secret";

router.use(cookieParser());

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "http://localhost:5173/login?error=google",
  }),
  (req, res) => {
    const user = req.user as {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
    };

    const token = jwt.sign(
      {
        userId: user.id,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/?login=success`
    );
  }
);

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    ) as {
      userId: string;
    };

    const { prisma } = await import(
      "../config/prisma"
    );

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");

  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

export default router;