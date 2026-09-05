import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/api/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email =
          profile.emails?.[0]?.value;

        if (!email) {
          return done(
            new Error("Google account has no email")
          );
        }

        const user = await prisma.user.upsert({
          where: {
            email,
          },
          update: {
            name:
              profile.displayName || "Google User",
            avatar:
              profile.photos?.[0]?.value || null,
            googleId: profile.id,
          },
          create: {
            email,
            name:
              profile.displayName || "Google User",
            avatar:
              profile.photos?.[0]?.value || null,
            googleId: profile.id,
          },
        });

        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

export default passport;