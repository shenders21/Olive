import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuid } from 'uuid';

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

const VENUES = [
  { id: 'alma', name: 'The Alma', area: 'Wandsworth', address: '499 Old York Rd, London SW18 1TF', type: 'pub', active: true, lat: 51.4593, lng: -0.1900, radius: 150 },
  { id: 'ivy', name: 'The Ivy House', area: 'Nunhead', address: '40 Stuart Rd, London SE15 3BE', type: 'pub', active: true, lat: 51.4676, lng: -0.0512, radius: 150 },
  { id: 'sekforde', name: 'The Sekforde', area: 'Clerkenwell', address: '34 Sekforde St, London EC1R 0HA', type: 'pub', active: true, lat: 51.5241, lng: -0.1054, radius: 150 },
];

const SEED_USERS = [
  { firstName: 'Sophie', age: 28, gender: 'female', bio: 'Reading Sally Rooney with a negroni.', photo: 'https://randomuser.me/api/portraits/women/44.jpg', interestedIn: 'male', ageMin: 26, ageMax: 38, venueId: 'alma' },
  { firstName: 'Grace', age: 31, gender: 'female', bio: 'Architect. Just finished a run.', photo: 'https://randomuser.me/api/portraits/women/68.jpg', interestedIn: 'male', ageMin: 28, ageMax: 40, venueId: 'alma' },
  { firstName: 'Isla', age: 26, gender: 'female', bio: 'Loves pubs with fireplaces.', photo: 'https://randomuser.me/api/portraits/women/32.jpg', interestedIn: 'male', ageMin: 25, ageMax: 34, venueId: 'alma' },
  { firstName: 'James', age: 30, gender: 'male', bio: 'Doctor. Off shift. Reading Le Carre.', photo: 'https://randomuser.me/api/portraits/men/45.jpg', interestedIn: 'female', ageMin: 25, ageMax: 34, venueId: 'alma' },
  { firstName: 'Oliver', age: 33, gender: 'male', bio: 'Just moved to SW18. Green corduroys.', photo: 'https://randomuser.me/api/portraits/men/22.jpg', interestedIn: 'female', ageMin: 27, ageMax: 36, venueId: 'alma' },
  { firstName: 'Henry', age: 29, gender: 'male', bio: 'Musician. Guitar case by the door.', photo: 'https://randomuser.me/api/portraits/men/78.jpg', interestedIn: 'female', ageMin: 24, ageMax: 32, venueId: 'alma' },
  { firstName: 'Amelia', age: 27, gender: 'female', bio: 'Painter. In the back corner.', photo: 'https://randomuser.me/api/portraits/women/12.jpg', interestedIn: 'male', ageMin: 26, ageMax: 36, venueId: 'ivy' },
  { firstName: 'Beatrice', age: 30, gender: 'female', bio: 'Journalist. Sipping a red.', photo: 'https://randomuser.me/api/portraits/women/55.jpg', interestedIn: 'male', ageMin: 28, ageMax: 40, venueId: 'ivy' },
  { firstName: 'Charlie', age: 32, gender: 'male', bio: 'Architect. Green jumper.', photo: 'https://randomuser.me/api/portraits/men/33.jpg', interestedIn: 'female', ageMin: 26, ageMax: 36, venueId: 'ivy' },
  { firstName: 'Daniel', age: 28, gender: 'male', bio: 'Chef. Day off.', photo: 'https://randomuser.me/api/portraits/men/64.jpg', interestedIn: 'female', ageMin: 25, ageMax: 33, venueId: 'ivy' },
  { firstName: 'Mia', age: 29, gender: 'female', bio: 'Barrister. Off Chancery Lane.', photo: 'https://randomuser.me/api/portraits/women/76.jpg', interestedIn: 'male', ageMin: 27, ageMax: 38, venueId: 'sekforde' },
  { firstName: 'Nora', age: 33, gender: 'female', bio: 'Sommelier. Ask me for a recommendation.', photo: 'https://randomuser.me/api/portraits/women/90.jpg', interestedIn: 'male', ageMin: 30, ageMax: 42, venueId: 'sekforde' },
  { firstName: 'Ethan', age: 31, gender: 'male', bio: 'Engineer. Long day. Pint of Guinness.', photo: 'https://randomuser.me/api/portraits/men/11.jpg', interestedIn: 'female', ageMin: 26, ageMax: 36, venueId: 'sekforde' },
  { firstName: 'Felix', age: 34, gender: 'male', bio: 'Writer. Notebook in hand.', photo: 'https://randomuser.me/api/portraits/men/47.jpg', interestedIn: 'female', ageMin: 28, ageMax: 40, venueId: 'sekforde' },
];

async function ensureSeed(db) {
  const vc = await db.collection('venues').countDocuments();
  if (vc === 0) await db.collection('venues').insertMany(VENUES);
  else {
    // Idempotent: ensure lat/lng/radius are present on all venues.
    for (const v of VENUES) {
      await db.collection('venues').updateOne({ id: v.id }, { $set: { lat: v.lat, lng: v.lng, radius: v.radius } });
    }
  }

  const uc = await db.collection('users').countDocuments({ isSeed: true });
  if (uc === 0) {
    const now = Date.now();
    const seeded = SEED_USERS.map(u => ({
      id: uuid(),
      firstName: u.firstName,
      age: u.age,
      gender: u.gender,
      bio: u.bio,
      photo: u.photo,
      modes: ['dating'],
      datingPrefs: { interestedIn: u.interestedIn, ageMin: u.ageMin, ageMax: u.ageMax },
      isSeed: true,
      createdAt: now,
      _seedVenue: u.venueId,
    }));
    await db.collection('users').insertMany(seeded);
    const sessions = seeded.map(u => ({
      id: uuid(),
      userId: u.id,
      venueId: u._seedVenue,
      active: true,
      startedAt: now,
    }));
    await db.collection('sessions').insertMany(sessions);
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
      const { userId, firstName, age, gender, bio, photo, modes, datingPrefs } = body;
      if (!userId || !firstName || !age || !gender) return err('missing required fields');
      const update = {
        firstName, age: Number(age), gender, bio: bio || '',
        photo: photo || null,
        modes: modes && modes.length ? modes : ['dating'],
        datingPrefs: datingPrefs || null,
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
      const { userId, venueId } = q;
      if (!userId || !venueId) return err('userId and venueId required');
      const me = await db.collection('users').findOne({ id: userId });
      if (!me) return err('user not found', 404);

      const activeSessions = await db.collection('sessions').find({ venueId, active: true }).toArray();
      const userIds = activeSessions.map(s => s.userId).filter(x => x !== userId);
      const usersHere = await db.collection('users').find({ id: { $in: userIds } }, { projection: { _id: 0 } }).toArray();
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
        const myLikes = await db.collection('likes').find({ fromUserId: userId, venueId }).toArray();
        const likedIds = new Set(myLikes.map(l => l.toUserId));
        const list = candidates.filter(c => !likedIds.has(c.id));
        return ok({
          role: 'browser',
          venueLive: activeSessions.length,
          candidates: list.map(c => ({ id: c.id, firstName: c.firstName, age: c.age, bio: c.bio, photo: c.photo })),
        });
      }

      let incoming = await db.collection('likes').find({ toUserId: userId, venueId, status: 'pending' }).toArray();
      if (incoming.length === 0) {
        const compatibleSeedWomen = usersHere.filter(u => u.isSeed && u.gender === 'female' && (u.modes || []).includes('dating'));
        const shuffled = compatibleSeedWomen.sort(() => Math.random() - 0.5).slice(0, 2);
        const newLikes = shuffled.map(w => ({
          id: uuid(),
          fromUserId: w.id,
          toUserId: userId,
          venueId,
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
      return ok({ role: 'recipient', venueLive: activeSessions.length, incoming: revealed });
    }

    if (method === 'POST' && path === 'likes') {
      const { fromUserId, toUserId, venueId } = body;
      if (!fromUserId || !toUserId || !venueId) return err('missing fields');

      const existing = await db.collection('likes').findOne({ fromUserId, toUserId, venueId });
      if (existing) {
        const m = await db.collection('matches').findOne({
          venueId,
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

      const like = { id: uuid(), fromUserId, toUserId, venueId, status: 'pending', createdAt: Date.now() };
      await db.collection('likes').insertOne(like);

      const other = await db.collection('users').findOne({ id: toUserId });
      if (other && other.isSeed) {
        await db.collection('likes').updateOne({ id: like.id }, { $set: { status: 'accepted' } });
        const match = { id: uuid(), userA: fromUserId, userB: toUserId, venueId, createdAt: Date.now(), action: null };
        await db.collection('matches').insertOne(match);
        return ok({
          liked: true,
          matched: true,
          match: { ...match, _id: undefined },
          other: { id: other.id, firstName: other.firstName, age: other.age, bio: other.bio, photo: other.photo },
        });
      }

      const reverse = await db.collection('likes').findOne({ fromUserId: toUserId, toUserId: fromUserId, venueId });
      if (reverse) {
        await db.collection('likes').updateMany(
          { venueId, $or: [{ id: like.id }, { id: reverse.id }] },
          { $set: { status: 'accepted' } }
        );
        const match = { id: uuid(), userA: fromUserId, userB: toUserId, venueId, createdAt: Date.now(), action: null };
        await db.collection('matches').insertOne(match);
        const otherU = await db.collection('users').findOne({ id: toUserId }, { projection: { _id: 0 } });
        return ok({ liked: true, matched: true, match: { ...match, _id: undefined }, other: otherU });
      }

      return ok({ liked: true, matched: false });
    }

    if (method === 'POST' && path === 'likes/accept') {
      const { likeId, userId } = body;
      const like = await db.collection('likes').findOne({ id: likeId });
      if (!like) return err('like not found', 404);
      if (like.toUserId !== userId) return err('not your like', 403);
      await db.collection('likes').updateOne({ id: likeId }, { $set: { status: 'accepted' } });
      const match = { id: uuid(), userA: like.fromUserId, userB: like.toUserId, venueId: like.venueId, createdAt: Date.now(), action: null };
      await db.collection('matches').insertOne(match);
      const other = await db.collection('users').findOne({ id: like.fromUserId }, { projection: { _id: 0 } });
      const meUser = await db.collection('users').findOne({ id: userId }, { projection: { _id: 0 } });
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
