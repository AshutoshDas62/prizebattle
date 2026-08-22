import express from 'express';
import fs from 'fs';
import path from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Client } = pg;

const app = express();
const port = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'prizebattle-secret';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tournamentsPath = path.join(__dirname, 'data', 'tournaments.json');
const dbPath = path.join(__dirname, 'data', 'prizebattle.db');
const distPath = path.join(__dirname, 'dist');
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl);
let db = null;
let pgClient = null;
const DEFAULT_USER_PASSWORD = 'prizebattle123';

async function initializeDatabase() {
  if (usePostgres) {
    try {
      pgClient = new Client({
        connectionString: databaseUrl,
        ssl: isProduction ? { rejectUnauthorized: false } : false
      });
      await pgClient.connect();
      console.log('Connected to PostgreSQL.');
      return;
    } catch (error) {
      console.warn('PostgreSQL connection failed; falling back to SQLite.', error.message);
    }
  }

  db = new Database(dbPath);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY,
      game TEXT,
      title TEXT,
      mode TEXT,
      fee INTEGER,
      prize TEXT,
      spots TEXT,
      time TEXT,
      tag TEXT,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      email TEXT,
      wallet REAL,
      joined TEXT,
      activity TEXT,
      leaderboard TEXT,
      stats TEXT,
      password_hash TEXT,
      password_salt TEXT
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT,
      tournament_title TEXT,
      placement INTEGER,
      kills INTEGER,
      reward INTEGER,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

await initializeDatabase();

const defaultProfile = {
  id: 1,
  name: 'Ashutosh Das',
  wallet: 1240,
  role: 'admin',
  joined: [],
  activity: [
    { id: 1, label: 'Wallet top-up', amount: 500, kind: 'green', time: 'Today, 4:43 PM' },
    { id: 2, label: 'Winner reward — Erangel Elite', amount: 1200, kind: 'green', time: 'Aug 01, 9:31 PM' }
  ],
  leaderboard: [
    { rank: 4, name: 'BlazeOp', matches: 112, winRate: '31%', earnings: '₹31,220' },
    { rank: 5, name: 'FrostByte', matches: 98, winRate: '28%', earnings: '₹27,680' },
    { rank: 6, name: 'AlphaRush', matches: 81, winRate: '35%', earnings: '₹25,100' }
  ],
  stats: { winnings: 8750, matches: 47, wins: 12 }
};

const readJson = (filePath, fallback) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    if (fallback !== undefined) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return null;
  }
};

function jsonValue(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) {
    return false;
  }
  const candidate = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function ensureTournamentColumns() {
  if (!db) {
    return;
  }

  const columns = db.prepare('PRAGMA table_info(tournaments)').all();
  const columnNames = columns.map((column) => column.name);

  if (!columnNames.includes('room_id')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN room_id TEXT;');
  }
  if (!columnNames.includes('room_password')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN room_password TEXT;');
  }
  if (!columnNames.includes('status')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN status TEXT DEFAULT "scheduled";');
  }
  if (!columnNames.includes('created_by')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN created_by TEXT;');
  }
  if (!columnNames.includes('start_time')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN start_time TEXT;');
  }
}

function seedTournamentCatalog() {
  if (!db) {
    return;
  }

  ensureTournamentColumns();

  const catalog = readJson(tournamentsPath, []);
  const existing = db.prepare('SELECT COUNT(*) AS total FROM tournaments').get();
  if (!existing.total && Array.isArray(catalog) && catalog.length) {
    const statement = db.prepare(
      'INSERT INTO tournaments (id, game, title, mode, fee, prize, spots, time, tag, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    catalog.forEach((tournament) => {
      statement.run(
        tournament.id,
        tournament.game,
        tournament.title,
        tournament.mode,
        tournament.fee,
        tournament.prize,
        tournament.spots,
        tournament.time,
        tournament.tag,
        tournament.color
      );
    });
  }
}

function ensureUserPasswordColumns() {
  if (!db) {
    return;
  }

  const columns = db.prepare('PRAGMA table_info(users)').all();
  const hasHash = columns.some((column) => column.name === 'password_hash');
  const hasSalt = columns.some((column) => column.name === 'password_salt');
  if (!hasHash) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
  }
  if (!hasSalt) {
    db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT;');
  }
}

function ensureUserRoleColumn() {
  if (!db) {
    return;
  }

  const columns = db.prepare('PRAGMA table_info(users)').all();
  const hasRole = columns.some((column) => column.name === 'role');
  if (!hasRole) {
    db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "player";');
  }
}

function seedUsersTable() {
  if (!db) {
    return;
  }

  ensureUserPasswordColumns();
  ensureUserRoleColumn();
  const existing = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  if (existing.total === 0) {
    const { salt, hash } = hashPassword(DEFAULT_USER_PASSWORD);
    const statement = db.prepare(
      'INSERT INTO users (name, email, wallet, joined, activity, leaderboard, stats, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    statement.run(
      defaultProfile.name,
      '',
      defaultProfile.wallet,
      JSON.stringify(defaultProfile.joined),
      JSON.stringify(defaultProfile.activity),
      JSON.stringify(defaultProfile.leaderboard),
      JSON.stringify(defaultProfile.stats),
      hash,
      salt,
      defaultProfile.role
    );
  } else {
    const row = db.prepare('SELECT id, name, password_hash, password_salt, role FROM users WHERE name = ?').get(defaultProfile.name);
    if (row && (!row.password_hash || !row.password_salt)) {
      const { salt, hash } = hashPassword(DEFAULT_USER_PASSWORD);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, role = ? WHERE id = ?').run(hash, salt, defaultProfile.role, row.id);
    } else if (row && !row.role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(defaultProfile.role, row.id);
    }
  }
}

function migrateAdminName() {
  if (!db) {
    return;
  }

  db.prepare('UPDATE users SET name = ? WHERE name = ? AND role = ?').run('Ashutosh Das', 'Ashutosh Singh', 'admin');
}

function getRewardFromPlacement(placement) {
  if (placement === 1) return 1200;
  if (placement === 2) return 800;
  if (placement <= 5) return 250;
  return 0;
}

function getTournamentCatalog() {
  if (!db) {
    return [];
  }

  return db.prepare('SELECT * FROM tournaments ORDER BY id').all().map((item) => ({
    id: item.id,
    game: item.game,
    title: item.title,
    mode: item.mode,
    fee: item.fee,
    prize: item.prize,
    spots: item.spots,
    time: item.time,
    tag: item.tag,
    color: item.color,
    roomId: item.room_id || '',
    roomPassword: item.room_password || '',
    status: item.status || 'scheduled',
    startTime: item.start_time || item.time,
    createdBy: item.created_by || 'admin'
  }));
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    wallet: Number(row.wallet || 0),
    joined: jsonValue(row.joined, []),
    activity: jsonValue(row.activity, []),
    leaderboard: jsonValue(row.leaderboard, []),
    stats: jsonValue(row.stats, { winnings: 0, matches: 0, wins: 0 }),
    role: row.role || 'player',
    passwordHash: row.password_hash || '',
    passwordSalt: row.password_salt || ''
  };
}

function readUsers() {
  if (!db) {
    return [];
  }

  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  return rows.map(normalizeUser);
}

function writeUsers(users) {
  if (!db) {
    return;
  }

  const statement = db.prepare(
    'UPDATE users SET name = ?, email = ?, wallet = ?, joined = ?, activity = ?, leaderboard = ?, stats = ?, role = ? WHERE id = ?'
  );
  users.forEach((user) => {
    statement.run(
      user.name,
      user.email || '',
      Number(user.wallet || 0),
      JSON.stringify(user.joined || []),
      JSON.stringify(user.activity || []),
      JSON.stringify(user.leaderboard || []),
      JSON.stringify(user.stats || { winnings: 0, matches: 0, wins: 0 }),
      user.role || 'player',
      user.id
    );
  });
}

function getUserByName(name) {
  const users = readUsers();
  const normalizedName = (name || defaultProfile.name).trim() || defaultProfile.name;
  return users.find((user) => user.name.toLowerCase() === normalizedName.toLowerCase()) || null;
}

function authenticateUser(name, password = '') {
  const user = getUserByName(name);
  if (!user) {
    return null;
  }

  const passwordValue = String(password ?? '');
  if (!user.passwordHash || !user.passwordSalt) {
    return passwordValue === '' || passwordValue === DEFAULT_USER_PASSWORD ? user : null;
  }

  return verifyPassword(passwordValue, user.passwordSalt, user.passwordHash) ? user : null;
}

function getOrCreateUser(name, email = '', password = '') {
  const normalizedName = (name || defaultProfile.name).trim() || defaultProfile.name;
  let user = getUserByName(normalizedName);

  if (!user) {
    if (!db) {
      return null;
    }

    const { salt, hash } = hashPassword(password || DEFAULT_USER_PASSWORD);
    const insert = db.prepare(
      'INSERT INTO users (name, email, wallet, joined, activity, leaderboard, stats, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const created = {
      ...structuredClone(defaultProfile),
      name: normalizedName,
      email: email || '',
      id: undefined,
      role: 'player'
    };
    const result = insert.run(
      created.name,
      created.email,
      created.wallet,
      JSON.stringify(created.joined),
      JSON.stringify(created.activity),
      JSON.stringify(created.leaderboard),
      JSON.stringify(created.stats),
      hash,
      salt,
      created.role
    );
    return normalizeUser({
      id: result.lastInsertRowid,
      name: created.name,
      email: created.email,
      wallet: created.wallet,
      joined: JSON.stringify(created.joined),
      activity: JSON.stringify(created.activity),
      leaderboard: JSON.stringify(created.leaderboard),
      stats: JSON.stringify(created.stats),
      password_hash: hash,
      password_salt: salt,
      role: 'player'
    });
  }

  if (email && !user.email) {
    user.email = email;
    writeUsers([user]);
  }

  if (password) {
    if (!db) {
      return user;
    }

    const { salt, hash } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);
    user.passwordHash = hash;
    user.passwordSalt = salt;
  }

  return user;
}

function getSessionProfile(req) {
  const sessionUser = req.session.user;
  if (!sessionUser) {
    return null;
  }

  const activeUser = getUserByName(sessionUser.name);
  if (!activeUser) {
    return null;
  }

  req.session.user = { id: activeUser.id, name: activeUser.name, email: activeUser.email || '', role: activeUser.role || 'player' };
  return readUsers().find((user) => user.id === activeUser.id) || activeUser;
}

function requireAuth(req, res, next) {
  if (!req.session.user || !getSessionProfile(req)) {
    return res.status(401).json({ success: false, message: 'Please log in first' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin' || !getSessionProfile(req)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return next();
}

seedTournamentCatalog();
seedUsersTable();
migrateAdminName();

let tournaments = getTournamentCatalog();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}));

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get('/api/tournaments', (_, res) => {
  tournaments = getTournamentCatalog();
  res.json({ tournaments });
});

app.post('/api/tournaments', (req, res) => {
  const { game, title, mode, fee, prize, spots, time, tag, color, roomId, roomPassword, startTime, status } = req.body || {};
  const sessionUser = req.session.user;

  if (!sessionUser || !sessionUser.role || sessionUser.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required to create tournaments' });
  }

  if (!title || !game || !mode || !fee) {
    return res.status(400).json({ success: false, message: 'Tournament title, game, mode, and fee are required' });
  }

  const nextId = (tournaments.at(-1)?.id ?? 0) + 1;
  const tournament = {
    id: nextId,
    game: String(game).trim(),
    title: String(title).trim(),
    mode: String(mode).trim(),
    fee: Number(fee),
    prize: String(prize || '₹2,000'),
    spots: String(spots || '0/100'),
    time: String(time || startTime || 'Today, 9:00 PM'),
    tag: String(tag || 'NEW'),
    color: String(color || 'purple'),
    roomId: String(roomId || '').trim(),
    roomPassword: String(roomPassword || '').trim(),
    status: String(status || 'scheduled').trim() || 'scheduled',
    startTime: String(startTime || time || 'Today, 9:00 PM'),
    createdBy: sessionUser.name
  };

  db.prepare(
    'INSERT INTO tournaments (id, game, title, mode, fee, prize, spots, time, tag, color, room_id, room_password, status, start_time, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    tournament.id,
    tournament.game,
    tournament.title,
    tournament.mode,
    tournament.fee,
    tournament.prize,
    tournament.spots,
    tournament.time,
    tournament.tag,
    tournament.color,
    tournament.roomId,
    tournament.roomPassword,
    tournament.status,
    tournament.startTime,
    tournament.createdBy
  );

  tournaments = getTournamentCatalog();
  return res.json({ success: true, tournament });
});

app.get('/api/app-state', requireAuth, (req, res) => {
  const profile = getSessionProfile(req);

  res.json({
    user: { ...req.session.user, email: profile.email || '', role: profile.role || 'player' },
    wallet: profile.wallet,
    joined: profile.joined,
    activity: profile.activity,
    leaderboard: profile.leaderboard,
    stats: profile.stats,
    email: profile.email || '',
    role: profile.role || 'player'
  });
});

app.post('/api/match-results', (req, res) => {
  const { title, placement, kills } = req.body || {};
  const sessionUser = req.session.user;

  if (!sessionUser) {
    return res.status(401).json({ success: false, message: 'Please log in to submit results' });
  }

  if (!title || !placement) {
    return res.status(400).json({ success: false, message: 'Match title and placement are required' });
  }

  const result = {
    user_name: sessionUser.name,
    tournament_title: String(title).trim(),
    placement: Number(placement),
    kills: Number(kills || 0),
    reward: getRewardFromPlacement(Number(placement))
  };

  db.prepare(
    'INSERT INTO match_results (user_name, tournament_title, placement, kills, reward, status) VALUES (?, ?, ?, ?, ?, ?)' 
  ).run(result.user_name, result.tournament_title, result.placement, result.kills, result.reward, 'pending');

  return res.json({ success: true, result });
});

app.get('/api/moderation', requireAdmin, (_, res) => {
  const rows = db.prepare('SELECT * FROM match_results WHERE status = ? ORDER BY id DESC').all('pending');
  res.json({ results: rows });
});

app.post('/api/moderation/:id/approve', requireAdmin, (req, res) => {
  const resultId = Number(req.params.id);
  const row = db.prepare('SELECT * FROM match_results WHERE id = ?').get(resultId);

  if (!row) {
    return res.status(404).json({ success: false, message: 'Result not found' });
  }

  const user = getUserByName(row.user_name);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const userList = readUsers();
  const index = userList.findIndex((entry) => entry.id === user.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'User not found in database' });
  }

  userList[index].wallet += Number(row.reward || 0);
  userList[index].stats = {
    ...userList[index].stats,
    matches: (Number(userList[index].stats?.matches || 0)) + 1,
    wins: (Number(userList[index].stats?.wins || 0)) + (Number(row.placement) === 1 ? 1 : 0),
    winnings: (Number(userList[index].stats?.winnings || 0)) + Number(row.reward || 0)
  };
  userList[index].activity.unshift({
    id: Date.now(),
    label: `Match payout — ${row.tournament_title}`,
    amount: Number(row.reward || 0),
    kind: 'green',
    time: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  });
  writeUsers(userList);

  db.prepare('UPDATE match_results SET status = ? WHERE id = ?').run('approved', resultId);
  return res.json({ success: true, wallet: userList[index].wallet, stats: userList[index].stats });
});

app.post('/api/login', (req, res) => {
  const { name, password = '', role = '' } = req.body || {};
  const user = authenticateUser(name, password);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid login credentials' });
  }

  if (role && role !== user.role) {
    return res.status(403).json({ success: false, message: `This account is registered as ${user.role}` });
  }

  req.session.user = { id: user.id, name: user.name, email: user.email || '', role: user.role || 'player' };
  return res.json({ success: true, user: req.session.user });
});

app.put('/api/password', requireAuth, (req, res) => {
  const { currentPassword = '', newPassword = '', confirmPassword = '' } = req.body || {};
  const profile = getSessionProfile(req);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'All password fields are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'New passwords do not match' });
  }
  if (!authenticateUser(profile.name, currentPassword)) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const { salt, hash } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, profile.id);
  return res.json({ success: true, message: 'Password changed successfully' });
});

app.post('/api/signup', (req, res) => {
  const { name, email, password = '', confirmPassword = '' } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  const user = getOrCreateUser(name, email, password);
  req.session.user = { id: user.id, name: user.name, email: user.email || '', role: user.role || 'player' };
  return res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { name, email = '' } = req.body || {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim();

  if (!trimmedName) {
    return res.status(400).json({ success: false, message: 'Player name is required' });
  }

  const profile = getSessionProfile(req);
  const users = readUsers();
  const currentUserIndex = users.findIndex((user) => user.id === profile.id);

  if (currentUserIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const duplicateName = users.find((user) => user.id !== profile.id && user.name.toLowerCase() === trimmedName.toLowerCase());
  if (duplicateName) {
    return res.status(409).json({ success: false, message: 'A player with that name already exists' });
  }

  users[currentUserIndex].name = trimmedName;
  users[currentUserIndex].email = trimmedEmail;
  writeUsers(users);

  req.session.user = { id: users[currentUserIndex].id, name: users[currentUserIndex].name, email: users[currentUserIndex].email || '', role: users[currentUserIndex].role || 'player' };

  return res.json({
    success: true,
    user: req.session.user,
    profile: users[currentUserIndex]
  });
});

app.post('/api/join', (req, res) => {
  const { tournamentId } = req.body;
  const profile = getSessionProfile(req);
  const users = readUsers();
  const currentUserIndex = users.findIndex((user) => user.id === profile.id);
  if (currentUserIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  const tournament = tournaments.find((item) => item.id === Number(tournamentId));
  if (!tournament) {
    return res.status(404).json({ message: 'Tournament not found' });
  }

  if (users[currentUserIndex].joined.includes(tournament.id)) {
    return res.status(400).json({ message: 'Already joined' });
  }

  if (users[currentUserIndex].wallet < tournament.fee) {
    return res.status(400).json({ message: 'Insufficient wallet balance' });
  }

  users[currentUserIndex].wallet -= tournament.fee;
  users[currentUserIndex].joined.push(tournament.id);
  users[currentUserIndex].activity.unshift({
    id: Date.now(),
    label: `Tournament entry — ${tournament.title}`,
    amount: -tournament.fee,
    kind: 'red',
    time: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  });
  writeUsers(users);

  return res.json({
    success: true,
    wallet: users[currentUserIndex].wallet,
    joined: users[currentUserIndex].joined,
    activity: users[currentUserIndex].activity
  });
});

app.post('/api/wallet/add', (req, res) => {
  const profile = getSessionProfile(req);
  const users = readUsers();
  const currentUserIndex = users.findIndex((user) => user.id === profile.id);

  if (currentUserIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  users[currentUserIndex].wallet += 500;
  users[currentUserIndex].activity.unshift({
    id: Date.now(),
    label: 'Wallet top-up',
    amount: 500,
    kind: 'green',
    time: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  });
  writeUsers(users);

  res.json({
    success: true,
    wallet: users[currentUserIndex].wallet,
    activity: users[currentUserIndex].activity
  });
});

app.post('/api/withdraw', (req, res) => {
  const profile = getSessionProfile(req);
  const users = readUsers();
  const currentUserIndex = users.findIndex((user) => user.id === profile.id);
  const amount = Number(req.body?.amount || 200);

  if (currentUserIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Invalid withdrawal amount' });
  }

  if (users[currentUserIndex].wallet < amount) {
    return res.status(400).json({ message: 'Insufficient wallet balance for withdrawal' });
  }

  users[currentUserIndex].wallet -= amount;
  users[currentUserIndex].activity.unshift({
    id: Date.now(),
    label: 'Withdrawal request',
    amount: -amount,
    kind: 'red',
    time: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  });
  writeUsers(users);

  res.json({
    success: true,
    wallet: users[currentUserIndex].wallet,
    activity: users[currentUserIndex].activity
  });
});

if (fs.existsSync(distPath)) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Frontend build not found. Run npm run build first.' });
  });
}

app.listen(port, () => {
  console.log(`PrizeBattle server running at http://localhost:${port}`);
});
