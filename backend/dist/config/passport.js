"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const prisma_1 = require("./prisma");
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/api/auth/google/callback",
}, async (_accessToken, _refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            return done(new Error("Google account has no email"));
        }
        const user = await prisma_1.prisma.user.upsert({
            where: {
                email,
            },
            update: {
                name: profile.displayName || "Google User",
                avatar: profile.photos?.[0]?.value || null,
                googleId: profile.id,
            },
            create: {
                email,
                name: profile.displayName || "Google User",
                avatar: profile.photos?.[0]?.value || null,
                googleId: profile.id,
            },
        });
        return done(null, user);
    }
    catch (error) {
        return done(error);
    }
}));
exports.default = passport_1.default;
