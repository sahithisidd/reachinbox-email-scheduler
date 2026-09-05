import { Router } from "express";
import passport from "../config/passport";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";

const router = Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "reachinbox-local-secret-2026";

// --------------------------------------------------
// Google Login
// --------------------------------------------------

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

// --------------------------------------------------
// Google Callback
// --------------------------------------------------

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/",
  }),
  (req, res) => {
    try {
      const user = req.user as {
        id: string;
        name: string;
        email: string;
        avatar?: string | null;
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

      // Store JWT in HTTP-only cookie
      res.cookie("token", token, {
         httpOnly: true,
         secure: true,
         sameSite: "lax",
         path: "/",
         maxAge: 7 * 24 * 60 * 60 * 1000,
        });

      // IMPORTANT:
      // After Google login, go to the deployed frontend,
      // not localhost.
      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:5173";

      return res.redirect(`${frontendUrl}/?login=success`);
    } catch (error) {
      console.error("Google callback error:", error);

      return res.status(500).json({
        success: false,
        message: "Google login failed",
      });
    }
  }
);

// --------------------------------------------------
// Get logged-in user
// --------------------------------------------------

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token;

    console.log("Auth cookie exists:", Boolean(token));

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

    console.log("Logged-in user:", user.email);

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

// --------------------------------------------------
// Logout
// --------------------------------------------------

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
});

  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

export default router;