import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './src/models/User.js';
import { Listing } from './src/models/Listing.js';
import { Report } from './src/models/Report.js';
import authRoutes from './src/routes/authRoutes.js';
import reportRoutes from './src/routes/reportRoutes.js';
import { requestLogger } from './src/middleware/logger.js';
import { signToken } from './src/middleware/auth.js';

process.env.JWT_SECRET = 'test-secret-key-12345678901234567890';
process.env.PORT = '5002';

async function runTests() {
  console.log('--- STARTING PROD ADDITIONS VERIFICATION ---');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log('Connected to MongoMemoryServer');

  const app = express();
  app.use(express.json());
  app.use(requestLogger);

  // Health check endpoint as in server/index.js
  app.get('/api/v1/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
      status: 'ok',
      service: 'NearNest API Engine',
      environment: process.env.NODE_ENV || 'test',
      uptimeSeconds: Math.floor(process.uptime()),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        rssMB: Math.round(memory.rss / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/reports', reportRoutes);

  const server = app.listen(5002);

  const baseUrl = 'http://127.0.0.1:5002';

  try {
    // 1. Health check test
    console.log('[TEST 1] Testing /api/v1/health...');
    const healthRes = await fetch(`${baseUrl}/api/v1/health`).then(r => r.json());
    if (healthRes.status === 'ok' && healthRes.database === 'connected') {
      console.log('✅ Health check passed with status ok and database connected');
    } else {
      throw new Error('Health check failed: ' + JSON.stringify(healthRes));
    }

    // 2. Create users
    console.log('[TEST 2] Creating test users...');
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    const userA = await User.create({
      name: 'Alice Reporter',
      email: 'alice@example.com',
      passwordHash: hashedPassword,
      phone: '9876543210',
      role: 'user'
    });
    const userB = await User.create({
      name: 'Bob Admin',
      email: 'bhupeshsinghsamant@admin.com',
      passwordHash: hashedPassword,
      phone: '9876543211',
      role: 'admin'
    });

    const listing = await Listing.create({
      ownerId: userA._id,
      ownerName: userA.name,
      ownerPhone: userA.phone,
      title: 'Suspicious 1BHK Flat',
      description: 'Send advance immediately',
      type: 'room',
      locality: 'Khatima Main Road',
      latitude: 28.9202,
      longitude: 79.9723,
      location: { type: 'Point', coordinates: [79.9723, 28.9202] },
      roomDetails: {
        rentMonthly: 1500,
        roomType: '1RK',
        furnishing: 'unfurnished',
        availabilityStatus: 'immediate'
      }
    });

    const tokenA = signToken({ id: userA._id.toString(), email: userA.email, role: userA.role });
    const tokenB = signToken({ id: userB._id.toString(), email: userB.email, role: userB.role });

    // 3. Test Report Submission
    console.log('[TEST 3] Submitting Abuse Report...');
    const reportRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        targetType: 'listing',
        targetId: listing._id.toString(),
        reason: 'scam',
        details: 'Demanding advance deposit without letting me see the room.'
      })
    });
    const reportData = await reportRes.json();
    if (reportRes.status === 201 && reportData.data && reportData.data.reason === 'scam') {
      console.log('✅ Abuse report created successfully:', reportData.data._id);
    } else {
      throw new Error('Failed to create report: ' + JSON.stringify(reportData));
    }

    // 4. Test Duplicate Report Prevention
    console.log('[TEST 4] Testing duplicate report prevention...');
    const dupRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        targetType: 'listing',
        targetId: listing._id.toString(),
        reason: 'fake',
        details: 'Second attempt should be rejected.'
      })
    });
    if (dupRes.status === 400) {
      console.log('✅ Duplicate report prevented correctly with HTTP 400');
    } else {
      throw new Error('Duplicate report was not rejected: ' + dupRes.status);
    }

    // 5. Test Admin Reports Retrieval & Moderation
    console.log('[TEST 5] Testing Admin Report Retrieval & Moderation...');
    const adminReportsRes = await fetch(`${baseUrl}/api/reports/admin`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const adminReports = await adminReportsRes.json();
    if (adminReportsRes.status === 200 && adminReports.data && adminReports.data.length >= 1) {
      console.log(`✅ Admin retrieved ${adminReports.data.length} reports successfully`);
    } else {
      throw new Error('Admin report fetch failed: ' + JSON.stringify(adminReports));
    }

    const reportId = adminReports.data[0]._id;
    const modRes = await fetch(`${baseUrl}/api/reports/admin/${reportId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        action: 'hide_listing',
        notes: 'Listing verified as scam and hidden.'
      })
    });
    const modData = await modRes.json();
    if (modRes.status === 200 && modData.data && modData.data.status === 'action_taken' && modData.data.moderationAction === 'listing_hidden') {
      console.log('✅ Admin moderated report successfully (action: hide_listing)');
    } else {
      throw new Error('Admin report moderation failed: ' + JSON.stringify(modData));
    }

    // Verify listing was indeed hidden
    const hiddenListing = await Listing.findById(listing._id);
    if (hiddenListing.status === 'hidden') {
      console.log('✅ Listing status in database updated to "hidden"');
    } else {
      throw new Error('Listing status was not updated to hidden');
    }

    // 6. Test DPDP Data Export (Section 11)
    console.log('[TEST 6] Testing DPDP Data Export (Section 11)...');
    const exportRes = await fetch(`${baseUrl}/api/auth/me/export`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const exportData = await exportRes.json();
    if (exportRes.status === 200 && exportData.success && exportData.data.personalIdentifiers.email === 'alice@example.com' && exportData.data.listings.length === 1) {
      console.log('✅ DPDP Section 11 Data Export successful: Verified user profile & listings payload');
    } else {
      throw new Error('DPDP export failed: ' + JSON.stringify(exportData));
    }

    // 7. Test DPDP Account Deletion (Section 12)
    console.log('[TEST 7] Testing DPDP Account Deletion (Section 12)...');
    // Wrong password test
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ password: 'WrongPassword!' })
    });
    if (wrongPassRes.status === 401) {
      console.log('✅ Deletion rejected on incorrect password with HTTP 401');
    } else {
      throw new Error('Deletion should have failed on wrong password');
    }

    // Correct password test
    const delRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ password: 'Password123!' })
    });
    const delData = await delRes.json();
    if (delRes.status === 200 && delData.success) {
      console.log('✅ DPDP Account Deletion completed successfully:', delData.message);
    } else {
      throw new Error('DPDP Account Deletion failed: ' + JSON.stringify(delData));
    }

    // Verify user and listings deleted
    const userInDb = await User.findById(userA._id);
    const listingInDb = await Listing.findById(listing._id);
    if (!userInDb && !listingInDb) {
      console.log('✅ Cascading deletion verified: User and associated listings completely erased from database');
    } else {
      throw new Error('User or listing still exists in DB after deletion!');
    }

    console.log('\n=============================================');
    console.log('🎉 ALL 7/7 PROD ADDITIONS TESTS PASSED PERFECTLY!');
    console.log('=============================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
