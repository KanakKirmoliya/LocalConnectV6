import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { connectDB, disconnectDB } from "./config/db.js";
import { User } from "./models/User.js";
import { Listing } from "./models/Listing.js";

const rawSeed = JSON.parse(readFileSync(new URL("../data.json", import.meta.url)));

async function seed() {
  console.log("🌱 Starting database seeding...");
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    console.error("❌ Seeding failed: Not connected to MongoDB.");
    process.exit(1);
  }

  // CRITICAL SAFETY GUARD: Prevent destructive data wiping in production or without explicit opt-in
  if (process.env.NODE_ENV === "production") {
    console.error("🛑 FATAL: Seeding is strictly forbidden in production environment!");
    process.exit(1);
  }

  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    console.error(
      "🛑 BLOCKED: Seeding deletes existing users and listings. To proceed deliberately, set ALLOW_DESTRUCTIVE_SEED=true."
    );
    process.exit(1);
  }

  // Clear existing data (guarded opt-in for isolated test environments only)
  await User.deleteMany({});
  await Listing.deleteMany({});
  console.log("🧹 Cleared existing users and listings.");

  // 1. Seed Users
  const passwordHash = await bcrypt.hash("password123", 10);
  const adminHash = await bcrypt.hash("admin123", 10);

  const demoUser = await User.create({
    name: "Bhupesh Samant",
    email: "bhupesh@example.com",
    passwordHash,
    area: "Campus Gate 1",
    role: "user",
  });

  const adminUser = await User.create({
    name: "Admin Moderator",
    email: "admin@localconnect.in",
    passwordHash: adminHash,
    area: "Admin Office",
    role: "admin",
  });

  const otherUser = await User.create({
    name: "Lavish Bhatt",
    email: "lavish@example.com",
    passwordHash,
    area: "Sector 4",
    role: "user",
  });

  console.log(`👤 Created 3 seed users: ${demoUser.email}, ${adminUser.email}, ${otherUser.email}`);

  // 2. Seed Room Listings
  const roomDocs = (rawSeed.rooms || []).map((r, index) => ({
    ownerId: index % 2 === 0 ? demoUser._id : otherUser._id,
    ownerName: index % 2 === 0 ? demoUser.name : otherUser.name,
    type: "room",
    title: r.title,
    description: `Comfortable room managed by ${r.owner}. Rent: ₹${r.rent}/month.`,
    locality: `Locality ${index + 1}, near main market`,
    status: "active",
    photos: [],
    roomDetails: {
      rent: r.rent,
      period: "month",
      amenities: r.amenities || ["WiFi", "Water 24x7"],
      verified: r.verified || false,
    },
  }));

  // 3. Seed Vehicle Listings
  const vehicleDocs = (rawSeed.rentals || []).map((v, index) => ({
    ownerId: index % 2 === 0 ? otherUser._id : demoUser._id,
    ownerName: index % 2 === 0 ? otherUser.name : demoUser.name,
    type: "vehicle",
    title: v.name,
    description: `${v.type} available for local rental. Rate: ₹${v.rate}/hour. Well maintained.`,
    locality: `Station Road, Zone ${index + 1}`,
    status: "active",
    photos: [],
    vehicleDetails: {
      vehicleType: v.type === "Scooty" ? "Scooty" : v.type === "Car" ? "Car" : "Bike",
      rentalPrice: v.rate,
      pricingPeriod: "hour",
      available: v.available ?? true,
    },
  }));

  // 4. Seed Lost & Found Listings
  const lostFoundDocs = (rawSeed.lostfound || []).map((item, index) => ({
    ownerId: index % 2 === 0 ? demoUser._id : otherUser._id,
    ownerName: item.by || demoUser.name,
    type: "lost_found",
    title: item.title,
    description: `${item.kind === "lost" ? "Lost" : "Found"} near ${item.where}. Please reach out if you have information.`,
    locality: item.where,
    status: "active",
    photos: [],
    lostFoundDetails: {
      kind: item.kind === "lost" ? "lost" : "found",
      itemName: item.title,
      incidentDate: new Date(Date.now() - (item.minsAgo || 60) * 60000),
    },
  }));

  // 5. Seed Civil Help Listings
  const serviceDocs = (rawSeed.services || []).map((s, index) => ({
    ownerId: otherUser._id,
    ownerName: s.name,
    type: "service",
    title: s.name,
    description: `Professional ${s.trade} services in the local community. ${s.jobs} jobs completed with ${s.rating}★ rating.`,
    locality: `Community Block ${index + 1}`,
    status: "active",
    photos: [],
    serviceDetails: {
      serviceCategory: ["Electrician", "Mechanic", "Plumber", "Notes"].includes(s.trade) ? s.trade : "Other",
      pricingInfo: s.price,
      rating: s.rating,
      jobsCount: s.jobs,
      available: s.available ?? true,
    },
  }));

  const allListings = [...roomDocs, ...vehicleDocs, ...lostFoundDocs, ...serviceDocs];
  await Listing.insertMany(allListings);

  console.log(`📦 Seeded ${allListings.length} total listings:`);
  console.log(`   - Rooms: ${roomDocs.length}`);
  console.log(`   - Vehicles: ${vehicleDocs.length}`);
  console.log(`   - Lost & Found: ${lostFoundDocs.length}`);
  console.log(`   - Services: ${serviceDocs.length}`);

  console.log("\n✅ Database seeding completed successfully!");
  await disconnectDB();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
