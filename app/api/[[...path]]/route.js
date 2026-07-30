import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuid } from 'uuid';
import webpush from 'web-push';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME && process.env.DB_NAME !== 'your_database_name'
  ? process.env.DB_NAME
  : 'olive_branch';

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URL);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME);
}

// ===== Web Push: VAPID key generation + helper =====
// Keys are generated once and persisted in the `config` collection.
let vapidReady = null;
async function ensureVapid(db) {
  if (vapidReady) return vapidReady;
  let cfg = await db.collection('config').findOne({ id: 'vapid' });
  if (!cfg) {
    const keys = webpush.generateVAPIDKeys();
    cfg = { id: 'vapid', publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt: Date.now() };
    await db.collection('config').insertOne(cfg);
  }
  webpush.setVapidDetails('mailto:hello@olive.bar', cfg.publicKey, cfg.privateKey);
  vapidReady = cfg;
  return cfg;
}

async function sendPushToUser(db, userId, payload) {
  try {
    await ensureVapid(db);
    const subs = await db.collection('pushSubs').find({ userId }).toArray();
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      } catch (e) {
        // 410 Gone / 404 = subscription expired; remove it
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.collection('pushSubs').deleteOne({ _id: s._id });
        }
      }
    }));
  } catch (e) {
    console.error('push send failed', e.message);
  }
}

const VENUES = [
  { id: 'purpleowl', name: 'The Purple Owl', area: 'Wandsworth', address: 'Unit 1, Delta Business Park, 10 Smugglers Way, London SW18 1EG', type: 'bar', active: true, lat: 51.460329, lng: -0.191173, radius: 200 },
  // Other venues kept in code but deactivated for pilot — reactivate later by flipping active:true
  { id: 'alma', name: 'The Alma', area: 'Wandsworth', address: '499 Old York Rd, London SW18 1TF', type: 'pub', active: false, lat: 51.4593, lng: -0.1900, radius: 150 },
  { id: 'ivy', name: 'The Ivy House', area: 'Nunhead', address: '40 Stuart Rd, London SE15 3BE', type: 'pub', active: false, lat: 51.4676, lng: -0.0512, radius: 150 },
  { id: 'sekforde', name: 'The Sekforde', area: 'Clerkenwell', address: '34 Sekforde St, London EC1R 0HA', type: 'pub', active: false, lat: 51.5241, lng: -0.1054, radius: 150 },
];

// Seed users disabled for the pilot — only real people will appear in venues.
const SEED_USERS = [];

const SEED_USERS_LEGACY_REMOVED = [
  // The following seed users have been removed for the pilot.
  // Kept as a comment for future reference — restore them into SEED_USERS if you want a populated demo later.
  { firstName: 'Grace', age: 31, gender: 'female', bio: 'Architect. Just finished a run.', photo: 'https://randomuser.me/api/portraits/women/68.jpg', interestedIn: 'male', ageMin: 28, ageMax: 40, venueId: 'alma', modes: ['dating','networking'], role: 'Architect at Foster & Partners', partySize: null },
  { firstName: 'Isla', age: 26, gender: 'female', bio: 'Loves pubs with fireplaces.', photo: 'https://randomuser.me/api/portraits/women/32.jpg', interestedIn: 'male', ageMin: 25, ageMax: 34, venueId: 'alma', modes: ['dating','friends'], role: null, partySize: 2 },
  { firstName: 'James', age: 30, gender: 'male', bio: 'Doctor. Off shift. Reading Le Carre.', photo: 'https://randomuser.me/api/portraits/men/45.jpg', interestedIn: 'female', ageMin: 25, ageMax: 34, venueId: 'alma', modes: ['dating'], role: null, partySize: null },
  { firstName: 'Oliver', age: 33, gender: 'male', bio: 'Just moved to SW18. Green corduroys.', photo: 'https://randomuser.me/api/portraits/men/22.jpg', interestedIn: 'female', ageMin: 27, ageMax: 36, venueId: 'alma', modes: ['dating','networking'], role: 'Founder, early-stage SaaS', partySize: null },
  { firstName: 'Henry', age: 29, gender: 'male', bio: 'Musician. Guitar case by the door.', photo: 'https://randomuser.me/api/portraits/men/78.jpg', interestedIn: 'female', ageMin: 24, ageMax: 32, venueId: 'alma', modes: ['dating','friends'], role: null, partySize: 3 },
  { firstName: 'Amelia', age: 27, gender: 'female', bio: 'Painter. In the back corner.', photo: 'https://randomuser.me/api/portraits/women/12.jpg', interestedIn: 'male', ageMin: 26, ageMax: 36, venueId: 'ivy', modes: ['dating','friends'], role: null, partySize: 1 },
  { firstName: 'Beatrice', age: 30, gender: 'female', bio: 'Journalist. Sipping a red.', photo: 'https://randomuser.me/api/portraits/women/55.jpg', interestedIn: 'male', ageMin: 28, ageMax: 40, venueId: 'ivy', modes: ['dating','networking'], role: 'Features editor at a magazine', partySize: null },
  { firstName: 'Charlie', age: 32, gender: 'male', bio: 'Architect. Green jumper.', photo: 'https://randomuser.me/api/portraits/men/33.jpg', interestedIn: 'female', ageMin: 26, ageMax: 36, venueId: 'ivy', modes: ['dating','networking'], role: 'Architect. Housing projects.', partySize: null },
  { firstName: 'Daniel', age: 28, gender: 'male', bio: 'Chef. Day off.', photo: 'https://randomuser.me/api/portraits/men/64.jpg', interestedIn: 'female', ageMin: 25, ageMax: 33, venueId: 'ivy', modes: ['dating','friends'], role: null, partySize: 2 },
  { firstName: 'Mia', age: 29, gender: 'female', bio: 'Barrister. Off Chancery Lane.', photo: 'https://randomuser.me/api/portraits/women/76.jpg', interestedIn: 'male', ageMin: 27, ageMax: 38, venueId: 'sekforde', modes: ['dating','networking'], role: 'Commercial barrister', partySize: null },
  { firstName: 'Nora', age: 33, gender: 'female', bio: 'Sommelier. Ask me for a recommendation.', photo: 'https://randomuser.me/api/portraits/women/90.jpg', interestedIn: 'male', ageMin: 30, ageMax: 42, venueId: 'sekforde', modes: ['dating','networking','friends'], role: 'Sommelier & wine writer', partySize: 1 },
  { firstName: 'Ethan', age: 31, gender: 'male', bio: 'Engineer. Long day. Pint of Guinness.', photo: 'https://randomuser.me/api/portraits/men/11.jpg', interestedIn: 'female', ageMin: 26, ageMax: 36, venueId: 'sekforde', modes: ['dating','networking'], role: 'Software engineer at a fintech', partySize: null },
  { firstName: 'Felix', age: 34, gender: 'male', bio: 'Writer. Notebook in hand.', photo: 'https://randomuser.me/api/portraits/men/47.jpg', interestedIn: 'female', ageMin: 28, ageMax: 40, venueId: 'sekforde', modes: ['dating','friends'], role: null, partySize: 2 },
  { firstName: 'Ruby', age: 27, gender: 'female', bio: 'In the corner with a friend.', photo: 'https://randomuser.me/api/portraits/women/23.jpg', interestedIn: 'male', ageMin: 26, ageMax: 36, venueId: 'purpleowl', modes: ['dating','friends'], role: null, partySize: 2 },
  { firstName: 'Zara', age: 30, gender: 'female', bio: 'Cocktail in hand. First time here.', photo: 'https://randomuser.me/api/portraits/women/85.jpg', interestedIn: 'male', ageMin: 28, ageMax: 40, venueId: 'purpleowl', modes: ['dating','networking'], role: 'PR at a design agency', partySize: null },
  { firstName: 'Max', age: 29, gender: 'male', bio: 'Live music tonight — first pint.', photo: 'https://randomuser.me/api/portraits/men/29.jpg', interestedIn: 'female', ageMin: 24, ageMax: 34, venueId: 'purpleowl', modes: ['dating'], role: null, partySize: null },
  { firstName: 'Leo', age: 32, gender: 'male', bio: 'Green shirt, brown boots.', photo: 'https://randomuser.me/api/portraits/men/54.jpg', interestedIn: 'female', ageMin: 26, ageMax: 38, venueId: 'purpleowl', modes: ['dating','networking'], role: 'Product manager, fintech', partySize: null },
];

// Allowed vocabulary for safe post-match cues. Only public, visible, staffed areas.
// Wearing/colour phrases removed — they belong in the chat as editable prompts, not as one-tap chips.
const ALLOWED_CUES = [
  'By the bar', 'By the front window', 'By the front door', 'Waiting outside the front',
  "I'll wave", 'Just ordering a drink', 'Give me two minutes', 'On my way now',
];

// Text chat rules — free text is allowed inside a match, but with hard limits.
const MAX_TEXT_MESSAGES_PER_USER_PER_MATCH = 20;
const MAX_TEXT_LENGTH = 200;
const BLOCKED_TEXT_PATTERNS = [
  /https?:\/\/\S+/i,                                       // URLs
  /\bwww\.\S+/i,                                            // www URLs
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,                // emails
  /(?:\+?\d[\s-]?){7,}\d/,                                 // phone-like number sequences (7+ digits)
  /\b(?:snap|snapchat|insta(?:gram)?|whatsapp|telegram|tiktok|@\w{3,})\b/i, // handle nudges
];
function containsBlocked(text) {
  return BLOCKED_TEXT_PATTERNS.some(p => p.test(text));
}

async function ensureSeed(db) {
  // For the pilot: wipe any seed users + their sessions on every boot.
  // (Cheap, idempotent — real users are untouched because they have isSeed:false.)
  const oldSeedUsers = await db.collection('users').find({ isSeed: true }).toArray();
  if (oldSeedUsers.length > 0) {
    const oldIds = oldSeedUsers.map(u => u.id);
    await db.collection('users').deleteMany({ isSeed: true });
    await db.collection('sessions').deleteMany({ userId: { $in: oldIds } });
    await db.collection('likes').deleteMany({ $or: [{ fromUserId: { $in: oldIds } }, { toUserId: { $in: oldIds } }] });
    await db.collection('matches').deleteMany({ $or: [{ userA: { $in: oldIds } }, { userB: { $in: oldIds } }] });
    await db.collection('messages').deleteMany({ $or: [{ fromUserId: { $in: oldIds } }, { toUserId: { $in: oldIds } }] });
  }

  // Upsert every venue (adds new venues on deploy, keeps existing ones fresh, deactivates removed ones)
  for (const v of VENUES) {
    await db.collection('venues').updateOne(
      { id: v.id },
      { $set: v },
      { upsert: true }
    );
  }

  // Seed users (currently empty for the pilot) — kept idempotent for when we restore them later
  const now = Date.now();
  for (const u of SEED_USERS) {
    const key = { firstName: u.firstName, isSeed: true, _seedVenue: u.venueId };
    const existing = await db.collection('users').findOne(key);
    const profile = {
      firstName: u.firstName, age: u.age, gender: u.gender, bio: u.bio, photo: u.photo,
      modes: u.modes || ['dating'],
      datingPrefs: { interestedIn: u.interestedIn, ageMin: u.ageMin, ageMax: u.ageMax },
      friendProfile: u.partySize ? { partySize: u.partySize } : null,
      networkingProfile: u.role ? { role: u.role } : null,
      isSeed: true, _seedVenue: u.venueId,
    };
    let userId;
    if (existing) {
      await db.collection('users').updateOne({ id: existing.id }, { $set: profile });
      userId = existing.id;
    } else {
      userId = uuid();
      await db.collection('users').insertOne({ ...profile, id: userId, createdAt: now });
    }
    const sess = await db.collection('sessions').findOne({ userId, venueId: u.venueId, active: true });
    if (!sess) {
      await db.collection('sessions').insertOne({ id: uuid(), userId, venueId: u.venueId, active: true, startedAt: now });
    }
  }
}

const ok = (data) => NextResponse.json(data);
const err = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

async function handle(request, { params }) {
  try {
    const db = await getDb();
    await ensureSeed(db);

    const method = request.method;
    const resolved = await params;
    const path = (resolved?.path || []).join('/');
    const url = new URL(request.url);
    const q = Object.fromEntries(url.searchParams.entries());
    const body = ['POST', 'PUT', 'PATCH'].includes(method)
      ? await request.json().catch(() => ({}))
      : {};

    if (method === 'POST' && path === 'session/init') {
      const userId = uuid();
      await db.collection('users').insertOne({ id: userId, isSeed: false, createdAt: Date.now() });
      return ok({ userId });
    }

    if (method === 'GET' && path === 'venues') {
      const venues = await db.collection('venues').find({ active: true }, { projection: { _id: 0 } }).toArray();
      const counts = await db.collection('sessions').aggregate([
        { $match: { active: true } },
        { $group: { _id: '$venueId', c: { $sum: 1 } } }
      ]).toArray();
      const cmap = Object.fromEntries(counts.map(x => [x._id, x.c]));
      const lat = q.lat ? parseFloat(q.lat) : null;
      const lng = q.lng ? parseFloat(q.lng) : null;
      const enriched = venues.map(v => {
        let distance = null, nearby = false;
        if (lat != null && lng != null && v.lat != null && v.lng != null) {
          // Haversine distance in metres
          const toRad = x => x * Math.PI / 180;
          const R = 6371000;
          const dLat = toRad(v.lat - lat);
          const dLng = toRad(v.lng - lng);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(v.lat)) * Math.sin(dLng / 2) ** 2;
          distance = Math.round(2 * R * Math.asin(Math.sqrt(a)));
          nearby = distance <= (v.radius || 150);
        }
        return { ...v, liveCount: cmap[v.id] || 0, distance, nearby };
      });
      // Sort by distance if we have it
      if (lat != null) enriched.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      return ok({ venues: enriched, located: lat != null });
    }

    if (method === 'POST' && path === 'checkin') {
      const { userId, venueId } = body;
      if (!userId || !venueId) return err('userId and venueId required');
      await db.collection('sessions').updateMany({ userId, active: true }, { $set: { active: false, endedAt: Date.now() } });
      const session = { id: uuid(), userId, venueId, active: true, startedAt: Date.now() };
      await db.collection('sessions').insertOne(session);
      const venue = await db.collection('venues').findOne({ id: venueId }, { projection: { _id: 0 } });
      return ok({ session: { ...session, _id: undefined }, venue });
    }

    if (method === 'POST' && path === 'leave') {
      const { userId } = body;
      await db.collection('sessions').updateMany({ userId, active: true }, { $set: { active: false, endedAt: Date.now() } });
      return ok({ ok: true });
    }

    if (method === 'POST' && path === 'profile') {
      const { userId, firstName, age, gender, bio, photo, modes, datingPrefs, friendProfile, networkingProfile } = body;
      if (!userId || !firstName || !age || !gender) return err('missing required fields');
      const update = {
        firstName, age: Number(age), gender, bio: bio || '',
        photo: photo || null,
        modes: modes && modes.length ? modes : ['dating'],
        datingPrefs: datingPrefs || null,
        friendProfile: friendProfile || null,
        networkingProfile: networkingProfile || null,
        updatedAt: Date.now(),
      };
      await db.collection('users').updateOne({ id: userId }, { $set: update }, { upsert: true });
      const user = await db.collection('users').findOne({ id: userId }, { projection: { _id: 0 } });
      return ok({ user });
    }

    if (method === 'GET' && path.startsWith('profile/')) {
      const userId = path.split('/')[1];
      const user = await db.collection('users').findOne({ id: userId }, { projection: { _id: 0 } });
      if (!user) return err('not found', 404);
      return ok({ user });
    }

    if (method === 'GET' && path === 'feed') {
      const { userId, venueId, mode = 'dating' } = q;
      if (!userId || !venueId) return err('userId and venueId required');
      const me = await db.collection('users').findOne({ id: userId });
      if (!me) return err('user not found', 404);

      const activeSessions = await db.collection('sessions').find({ venueId, active: true }).toArray();
      const rawUserIds = activeSessions.map(s => s.userId).filter(x => x !== userId);

      // Exclude anyone I've blocked or who has blocked me (both directions)
      const [blockedByMe, blocksAgainstMe] = await Promise.all([
        db.collection('blocks').find({ userId }).toArray(),
        db.collection('blocks').find({ blockedUserId: userId }).toArray(),
      ]);
      const blockedIds = new Set([
        ...blockedByMe.map(b => b.blockedUserId),
        ...blocksAgainstMe.map(b => b.userId),
      ]);
      const userIds = rawUserIds.filter(x => !blockedIds.has(x));

      const usersHere = await db.collection('users').find({ id: { $in: userIds } }, { projection: { _id: 0 } }).toArray();

      // === FRIENDS mode ===
      if (mode === 'friends') {
        const candidates = usersHere.filter(u => (u.modes || []).includes('friends'));
        const myLikes = await db.collection('likes').find({ fromUserId: userId, venueId, mode: 'friends' }).toArray();
        const likedIds = new Set(myLikes.map(l => l.toUserId));
        const list = candidates.filter(c => !likedIds.has(c.id));
        // Also surface incoming invites (pending likes to me in this mode)
        const incoming = await db.collection('likes').find({ toUserId: userId, venueId, mode: 'friends', status: 'pending' }).toArray();
        const fromUsers = await db.collection('users').find({ id: { $in: incoming.map(l => l.fromUserId) } }, { projection: { _id: 0 } }).toArray();
        const fmap = Object.fromEntries(fromUsers.map(u => [u.id, u]));
        return ok({
          mode: 'friends',
          role: 'browser',
          venueLive: activeSessions.length,
          candidates: list.map(c => ({
            id: c.id, firstName: c.firstName, age: c.age, bio: c.bio, photo: c.photo,
            partySize: c.friendProfile?.partySize || 1,
          })),
          incoming: incoming.map(l => {
            const u = fmap[l.fromUserId] || {};
            return { likeId: l.id, firstName: u.firstName, age: u.age, photo: u.photo, partySize: u.friendProfile?.partySize || 1, bio: u.bio };
          }),
        });
      }

      // === NETWORKING mode ===
      if (mode === 'networking') {
        const candidates = usersHere.filter(u => (u.modes || []).includes('networking'));
        const myLikes = await db.collection('likes').find({ fromUserId: userId, venueId, mode: 'networking' }).toArray();
        const likedIds = new Set(myLikes.map(l => l.toUserId));
        const list = candidates.filter(c => !likedIds.has(c.id));
        const incoming = await db.collection('likes').find({ toUserId: userId, venueId, mode: 'networking', status: 'pending' }).toArray();
        const fromUsers = await db.collection('users').find({ id: { $in: incoming.map(l => l.fromUserId) } }, { projection: { _id: 0 } }).toArray();
        const fmap = Object.fromEntries(fromUsers.map(u => [u.id, u]));
        return ok({
          mode: 'networking',
          role: 'browser',
          venueLive: activeSessions.length,
          candidates: list.map(c => ({
            id: c.id, firstName: c.firstName, age: c.age, bio: c.bio, photo: c.photo,
            role: c.networkingProfile?.role || null,
          })),
          incoming: incoming.map(l => {
            const u = fmap[l.fromUserId] || {};
            return { likeId: l.id, firstName: u.firstName, age: u.age, photo: u.photo, role: u.networkingProfile?.role || null, bio: u.bio };
          }),
        });
      }

      // === DATING mode (default) ===
      const myPrefs = me.datingPrefs || {};

      if (me.gender !== 'male') {
        const candidates = usersHere.filter(u => {
          if (!u.modes || !u.modes.includes('dating')) return false;
          if (u.gender !== 'male') return false;
          if (myPrefs.interestedIn && myPrefs.interestedIn !== u.gender) return false;
          if (myPrefs.ageMin && u.age < myPrefs.ageMin) return false;
          if (myPrefs.ageMax && u.age > myPrefs.ageMax) return false;
          const theirPrefs = u.datingPrefs || {};
          if (theirPrefs.interestedIn && theirPrefs.interestedIn !== me.gender) return false;
          if (theirPrefs.ageMin && me.age < theirPrefs.ageMin) return false;
          if (theirPrefs.ageMax && me.age > theirPrefs.ageMax) return false;
          return true;
        });
        const myLikes = await db.collection('likes').find({ fromUserId: userId, venueId, mode: { $in: ['dating', null] } }).toArray();
        const likedIds = new Set(myLikes.map(l => l.toUserId));
        const list = candidates.filter(c => !likedIds.has(c.id));
        return ok({
          mode: 'dating',
          role: 'browser',
          venueLive: activeSessions.length,
          candidates: list.map(c => ({ id: c.id, firstName: c.firstName, age: c.age, bio: c.bio, photo: c.photo })),
        });
      }

      let incoming = await db.collection('likes').find({ toUserId: userId, venueId, status: 'pending', mode: { $in: ['dating', null] } }).toArray();
      if (incoming.length === 0) {
        const compatibleSeedWomen = usersHere.filter(u => u.isSeed && u.gender === 'female' && (u.modes || []).includes('dating'));
        const shuffled = compatibleSeedWomen.sort(() => Math.random() - 0.5).slice(0, 2);
        const newLikes = shuffled.map(w => ({
          id: uuid(),
          fromUserId: w.id,
          toUserId: userId,
          venueId,
          mode: 'dating',
          status: 'pending',
          createdAt: Date.now() - Math.floor(Math.random() * 5 * 60 * 1000),
        }));
        if (newLikes.length) await db.collection('likes').insertMany(newLikes);
        incoming = newLikes;
      }

      const fromIds = incoming.map(l => l.fromUserId);
      const fromUsers = await db.collection('users').find({ id: { $in: fromIds } }, { projection: { _id: 0 } }).toArray();
      const fmap = Object.fromEntries(fromUsers.map(u => [u.id, u]));
      const revealed = incoming.map(l => {
        const u = fmap[l.fromUserId] || {};
        return {
          likeId: l.id,
          age: u.age,
          bio: u.bio,
          blurredPhoto: u.photo,
          createdAt: l.createdAt,
        };
      });
      return ok({ mode: 'dating', role: 'recipient', venueLive: activeSessions.length, incoming: revealed });
    }

    if (method === 'POST' && path === 'likes') {
      const { fromUserId, toUserId, venueId, mode = 'dating' } = body;
      if (!fromUserId || !toUserId || !venueId) return err('missing fields');

      const existing = await db.collection('likes').findOne({ fromUserId, toUserId, venueId, mode });
      if (existing) {
        const m = await db.collection('matches').findOne({
          venueId, mode,
          $or: [
            { userA: fromUserId, userB: toUserId },
            { userA: toUserId, userB: fromUserId },
          ]
        });
        if (m) {
          const other = await db.collection('users').findOne({ id: toUserId }, { projection: { _id: 0 } });
          return ok({ liked: true, matched: true, match: { ...m, _id: undefined }, other });
        }
        return ok({ liked: true, matched: false });
      }

      const like = { id: uuid(), fromUserId, toUserId, venueId, mode, status: 'pending', createdAt: Date.now() };
      await db.collection('likes').insertOne(like);

      const other = await db.collection('users').findOne({ id: toUserId });
      if (other && other.isSeed) {
        await db.collection('likes').updateOne({ id: like.id }, { $set: { status: 'accepted' } });
        const match = { id: uuid(), userA: fromUserId, userB: toUserId, venueId, mode, createdAt: Date.now(), action: null };
        await db.collection('matches').insertOne(match);
        sendPushToUser(db, fromUserId, {
          title: 'A quiet match',
          body: `You matched with ${other.firstName}. Meet by the bar.`,
          url: '/',
          tag: 'match',
        });
        return ok({
          liked: true,
          matched: true,
          match: { ...match, _id: undefined },
          other: { id: other.id, firstName: other.firstName, age: other.age, bio: other.bio, photo: other.photo,
                   partySize: other.friendProfile?.partySize, role: other.networkingProfile?.role },
        });
      }

      const reverse = await db.collection('likes').findOne({ fromUserId: toUserId, toUserId: fromUserId, venueId, mode });
      if (reverse) {
        await db.collection('likes').updateMany(
          { venueId, mode, $or: [{ id: like.id }, { id: reverse.id }] },
          { $set: { status: 'accepted' } }
        );
        const match = { id: uuid(), userA: fromUserId, userB: toUserId, venueId, mode, createdAt: Date.now(), action: null };
        await db.collection('matches').insertOne(match);
        const otherU = await db.collection('users').findOne({ id: toUserId }, { projection: { _id: 0 } });
        const meU = await db.collection('users').findOne({ id: fromUserId }, { projection: { _id: 0 } });
        sendPushToUser(db, fromUserId, { title: 'A quiet match', body: `You matched with ${otherU?.firstName || 'someone here'}. Meet by the bar.`, tag: 'match' });
        sendPushToUser(db, toUserId, { title: 'A quiet match', body: `You matched with ${meU?.firstName || 'someone here'}. Meet by the bar.`, tag: 'match' });
        return ok({ liked: true, matched: true, match: { ...match, _id: undefined }, other: otherU });
      }

      // No match yet — for dating mode, this becomes a discreet "someone likes you" notification to the recipient
      if (mode === 'dating') {
        sendPushToUser(db, toUserId, {
          title: 'Someone nearby',
          body: 'Someone here would like to meet you.',
          tag: 'like',
        });
      }
      return ok({ liked: true, matched: false });
    }

    if (method === 'POST' && path === 'likes/accept') {
      const { likeId, userId } = body;
      const like = await db.collection('likes').findOne({ id: likeId });
      if (!like) return err('like not found', 404);
      if (like.toUserId !== userId) return err('not your like', 403);
      await db.collection('likes').updateOne({ id: likeId }, { $set: { status: 'accepted' } });
      const match = { id: uuid(), userA: like.fromUserId, userB: like.toUserId, venueId: like.venueId, mode: like.mode || 'dating', createdAt: Date.now(), action: null };
      await db.collection('matches').insertOne(match);
      const other = await db.collection('users').findOne({ id: like.fromUserId }, { projection: { _id: 0 } });
      const meUser = await db.collection('users').findOne({ id: userId }, { projection: { _id: 0 } });
      // Push to both users
      sendPushToUser(db, userId, { title: 'A quiet match', body: `You matched with ${other?.firstName || 'someone here'}. Meet by the bar.`, tag: 'match' });
      sendPushToUser(db, like.fromUserId, { title: 'A quiet match', body: `You matched with ${meUser?.firstName || 'someone here'}. Meet by the bar.`, tag: 'match' });
      return ok({ matched: true, match: { ...match, _id: undefined }, other, me: meUser });
    }

    if (method === 'POST' && path === 'likes/decline') {
      const { likeId, userId } = body;
      const like = await db.collection('likes').findOne({ id: likeId });
      if (!like || like.toUserId !== userId) return err('bad like', 400);
      await db.collection('likes').updateOne({ id: likeId }, { $set: { status: 'declined' } });
      return ok({ ok: true });
    }

    if (method === 'GET' && path === 'matches') {
      const { userId } = q;
      const list = await db.collection('matches').find({
        $or: [{ userA: userId }, { userB: userId }]
      }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      const otherIds = list.map(m => m.userA === userId ? m.userB : m.userA);
      const others = await db.collection('users').find({ id: { $in: otherIds } }, { projection: { _id: 0 } }).toArray();
      const omap = Object.fromEntries(others.map(u => [u.id, u]));
      return ok({
        matches: list.map(m => ({
          ...m,
          other: omap[m.userA === userId ? m.userB : m.userA] || null,
        }))
      });
    }

    if (method === 'POST' && path === 'matches/action') {
      const { matchId, userId, action } = body;
      if (!['heading_over', 'five_minutes', 'not_now'].includes(action)) return err('bad action');
      await db.collection('matches').updateOne({ id: matchId }, { $set: { [`actions.${userId}`]: action, actionAt: Date.now() } });
      return ok({ ok: true });
    }

    // ===== Cues (post-match constrained messages) =====
    // Server enforces the allowlist so no free-text abuse is possible.
    if (method === 'GET' && path === 'cues/allowed') {
      return ok({ cues: ALLOWED_CUES });
    }

    if (method === 'POST' && path === 'messages') {
      const { matchId, fromUserId, cue } = body;
      if (!matchId || !fromUserId || !cue) return err('missing fields');
      if (!ALLOWED_CUES.includes(cue)) return err('cue not allowed');
      const match = await db.collection('matches').findOne({ id: matchId });
      if (!match) return err('match not found', 404);
      if (match.userA !== fromUserId && match.userB !== fromUserId) return err('not your match', 403);
      const toUserId = match.userA === fromUserId ? match.userB : match.userA;
      const msg = { id: uuid(), matchId, fromUserId, toUserId, venueId: match.venueId, type: 'cue', cue, createdAt: Date.now() };
      await db.collection('messages').insertOne(msg);

      // If the other side is a seed user, auto-echo a plausible cue back ~2s later so the demo feels alive.
      const other = await db.collection('users').findOne({ id: toUserId });
      if (other && other.isSeed) {
        const echoPool = ['By the bar', 'By the front window', "I'll wave", 'Give me two minutes', 'On my way now'];
        const echo = echoPool[Math.floor(Math.random() * echoPool.length)];
        const echoMsg = {
          id: uuid(), matchId, fromUserId: toUserId, toUserId: fromUserId,
          venueId: match.venueId, type: 'cue', cue: echo, createdAt: Date.now() + 2000,
        };
        await db.collection('messages').insertOne(echoMsg);
      }
      return ok({ ok: true, message: { ...msg, _id: undefined } });
    }

    // ===== Free-text chat (post-match only, capped, filtered) =====
    if (method === 'POST' && path === 'messages/text') {
      const { matchId, fromUserId, text } = body;
      if (!matchId || !fromUserId || typeof text !== 'string') return err('missing fields');
      const clean = text.trim();
      if (clean.length === 0) return err('empty');
      if (clean.length > MAX_TEXT_LENGTH) return err(`Keep it under ${MAX_TEXT_LENGTH} characters.`);

      const match = await db.collection('matches').findOne({ id: matchId });
      if (!match) return err('match not found', 404);
      if (match.userA !== fromUserId && match.userB !== fromUserId) return err('not your match', 403);

      if (containsBlocked(clean)) {
        return NextResponse.json({ error: 'Keep contact details private until you have met.', filtered: true }, { status: 400 });
      }

      const myCount = await db.collection('messages').countDocuments({ matchId, fromUserId, type: 'text' });
      if (myCount >= MAX_TEXT_MESSAGES_PER_USER_PER_MATCH) {
        return NextResponse.json({ error: `You have reached the ${MAX_TEXT_MESSAGES_PER_USER_PER_MATCH} message limit for this match — go and meet them.`, capped: true }, { status: 429 });
      }

      const toUserId = match.userA === fromUserId ? match.userB : match.userA;
      const msg = { id: uuid(), matchId, fromUserId, toUserId, venueId: match.venueId, type: 'text', text: clean, createdAt: Date.now() };
      await db.collection('messages').insertOne(msg);

      // Auto-echo from a seed user so the demo feels alive
      const other = await db.collection('users').findOne({ id: toUserId });
      if (other && other.isSeed) {
        const echoPool = [
          'Ok, on my way over.',
          "I'll come find you — wearing black.",
          'By the bar, next to the till.',
          'Just ordered — see you in one min.',
          'Waving now, can you see me?',
          "Ha, small world — I'm the one in the denim jacket.",
        ];
        const echo = echoPool[Math.floor(Math.random() * echoPool.length)];
        const echoMsg = {
          id: uuid(), matchId, fromUserId: toUserId, toUserId: fromUserId,
          venueId: match.venueId, type: 'text', text: echo, createdAt: Date.now() + 2500,
        };
        await db.collection('messages').insertOne(echoMsg);
      }

      const remaining = MAX_TEXT_MESSAGES_PER_USER_PER_MATCH - (myCount + 1);
      // Notify the recipient (unless they're a seed)
      if (!other?.isSeed) {
        const meU = await db.collection('users').findOne({ id: fromUserId }, { projection: { _id: 0 } });
        sendPushToUser(db, toUserId, { title: meU?.firstName || 'Olive', body: clean, tag: 'msg-' + matchId });
      }
      return ok({ ok: true, message: { ...msg, _id: undefined }, remaining });
    }

    // ===== Report a message =====
    if (method === 'POST' && path === 'messages/report') {
      const { messageId, userId, reason } = body;
      const msg = await db.collection('messages').findOne({ id: messageId });
      if (!msg) return err('message not found', 404);
      if (msg.toUserId !== userId) return err('not your message', 403);
      await db.collection('reports').insertOne({
        id: uuid(),
        kind: 'message',
        messageId,
        matchId: msg.matchId,
        reportedUserId: msg.fromUserId,
        reporterUserId: userId,
        reason: reason || 'message',
        content: msg.text || msg.cue || '',
        createdAt: Date.now(),
      });
      await db.collection('messages').updateOne({ id: messageId }, { $set: { hiddenForReporter: true } });
      return ok({ ok: true });
    }

    // ===== Block a user (profile-level) — also files a report =====
    if (method === 'POST' && path === 'blocks') {
      const { userId, blockedUserId, reason } = body;
      if (!userId || !blockedUserId) return err('missing');
      const existing = await db.collection('blocks').findOne({ userId, blockedUserId });
      if (!existing) {
        await db.collection('blocks').insertOne({
          id: uuid(), userId, blockedUserId, reason: reason || null, createdAt: Date.now(),
        });
      }
      // Also log a report for admin review
      await db.collection('reports').insertOne({
        id: uuid(), kind: 'block', reportedUserId: blockedUserId, reporterUserId: userId,
        reason: reason || 'blocked', createdAt: Date.now(),
      });
      return ok({ ok: true });
    }

    if (method === 'GET' && path === 'blocks') {
      const { userId } = q;
      if (!userId) return err('userId required');
      const blocks = await db.collection('blocks').find({ userId }, { projection: { _id: 0 } }).toArray();
      return ok({ blocks });
    }

    // ===== Matches inbox with unread counts + last message =====
    if (method === 'GET' && path === 'matches/inbox') {
      const { userId } = q;
      if (!userId) return err('userId required');
      const list = await db.collection('matches').find({
        $or: [{ userA: userId }, { userB: userId }]
      }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();

      const otherIds = list.map(m => m.userA === userId ? m.userB : m.userA);
      const others = await db.collection('users').find({ id: { $in: otherIds } }, { projection: { _id: 0 } }).toArray();
      const omap = Object.fromEntries(others.map(u => [u.id, u]));

      // Last message per match + unread count
      const enriched = await Promise.all(list.map(async (m) => {
        const now = Date.now();
        const last = await db.collection('messages').find(
          { matchId: m.id, createdAt: { $lte: now } },
          { projection: { _id: 0 } }
        ).sort({ createdAt: -1 }).limit(1).toArray();
        const unread = await db.collection('messages').countDocuments({
          matchId: m.id,
          toUserId: userId,
          createdAt: { $lte: now, $gt: m.lastReadAt?.[userId] || 0 },
        });
        return {
          ...m,
          other: omap[m.userA === userId ? m.userB : m.userA] || null,
          lastMessage: last[0] || null,
          unread,
        };
      }));

      const totalUnread = enriched.reduce((s, x) => s + (x.unread || 0), 0);
      return ok({ matches: enriched, totalUnread });
    }

    if (method === 'POST' && path === 'matches/read') {
      const { matchId, userId } = body;
      if (!matchId || !userId) return err('missing');
      await db.collection('matches').updateOne({ id: matchId }, { $set: { [`lastReadAt.${userId}`]: Date.now() } });
      return ok({ ok: true });
    }

    // ===== Web Push: expose public VAPID key and manage subscriptions =====
    if (method === 'GET' && path === 'push/vapid') {
      const cfg = await ensureVapid(db);
      return ok({ publicKey: cfg.publicKey });
    }

    if (method === 'POST' && path === 'push/subscribe') {
      const { userId, subscription } = body;
      if (!userId || !subscription || !subscription.endpoint) return err('missing');
      await db.collection('pushSubs').updateOne(
        { userId, 'subscription.endpoint': subscription.endpoint },
        { $set: { userId, subscription, updatedAt: Date.now() } },
        { upsert: true }
      );
      return ok({ ok: true });
    }

    if (method === 'POST' && path === 'push/unsubscribe') {
      const { userId, endpoint } = body;
      if (!userId) return err('missing');
      if (endpoint) await db.collection('pushSubs').deleteOne({ userId, 'subscription.endpoint': endpoint });
      else await db.collection('pushSubs').deleteMany({ userId });
      return ok({ ok: true });
    }

    // Test-send a push (useful for verifying setup)
    if (method === 'POST' && path === 'push/test') {
      const { userId } = body;
      if (!userId) return err('missing');
      await sendPushToUser(db, userId, {
        title: 'Olive',
        body: 'Notifications are on — we\'ll only ping you when it matters.',
        tag: 'test',
      });
      return ok({ ok: true });
    }

    if (method === 'GET' && path === 'messages') {
      const { matchId, userId } = q;
      if (!matchId || !userId) return err('missing');
      const match = await db.collection('matches').findOne({ id: matchId });
      if (!match) return err('match not found', 404);
      if (match.userA !== userId && match.userB !== userId) return err('not your match', 403);
      // Only return messages whose createdAt is <= now (so scheduled echos appear at the right time)
      const now = Date.now();
      const list = await db.collection('messages').find(
        { matchId, createdAt: { $lte: now } },
        { projection: { _id: 0 } }
      ).sort({ createdAt: 1 }).toArray();
      return ok({ messages: list });
    }

    if (method === 'GET' && (path === '' || path === 'health')) {
      return ok({ ok: true, service: 'olive-branch', ts: Date.now() });
    }

    return err(`unknown route ${method} /${path}`, 404);
  } catch (e) {
    console.error('API error', e);
    return NextResponse.json({ error: e.message || 'internal error' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
