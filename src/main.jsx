import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import { firebaseEnabled } from './firebase';
import PhoneLogin from './PhoneLogin';

const STORAGE_KEY='prizebattle-state';
const getInitialState=()=>{
 try {
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
  return saved ?? { joined: [], wallet: 1240, activity: [], leaderboard: [], stats: { winnings: 8750, matches: 47, wins: 12 } };
 } catch {
  return { joined: [], wallet: 1240, activity: [], leaderboard: [], stats: { winnings: 8750, matches: 47, wins: 12 } };
 }
};
const Icon=({children})=><span className="icon">{children}</span>;
function App(){
 const [page,setPage]=useState('home');
 const [tournaments, setTournaments]=useState([]);
 const [appState,setAppState]=useState(getInitialState);
 const [toast,setToast]=useState('');
 const [filter,setFilter]=useState('all');
 const [selectedMatchId,setSelectedMatchId]=useState(null);
 const [showCreateForm,setShowCreateForm]=useState(false);
 const [moderationQueue,setModerationQueue]=useState([]);
 const [loading,setLoading]=useState(true);
 const [fetchError,setFetchError]=useState('');
 const [userName,setUserName]=useState('Ashutosh Das');
 const [userEmail,setUserEmail]=useState('');
 const [userRole,setUserRole]=useState('player');
 const [isLoggedIn,setIsLoggedIn]=useState(false);
 const [lobbyOpen,setLobbyOpen]=useState(false);

 const refreshAppState=async()=>{
  try {
  const [stateData, tournamentData] = await Promise.all([
    fetch('/api/app-state').then((res)=>res.json()),
   fetch('/api/tournaments').then((res)=>res.json())
   ]);
  const moderationData = stateData.user?.role === 'admin'
   ? await fetch('/api/moderation').then((res)=>res.ok ? res.json() : ({ results: [] }))
   : { results: [] };
   const mergedState={ ...getInitialState(), ...stateData, activity: stateData.activity ?? [], leaderboard: stateData.leaderboard ?? [], stats: stateData.stats ?? { winnings: 8750, matches: 47, wins: 12 } };
   setAppState(mergedState);
   setTournaments(tournamentData.tournaments ?? []);
   setModerationQueue(moderationData.results ?? []);
   setUserName(stateData.user?.name || 'Ashutosh Das');
   setUserEmail(stateData.user?.email || stateData.email || '');
   setUserRole(stateData.user?.role || stateData.role || 'player');
   setIsLoggedIn(Boolean(stateData.user));
   setFetchError('');
   return mergedState;
  } catch {
   const saved=getInitialState();
   setAppState(saved);
   setTournaments(saved.tournaments ?? []);
   setModerationQueue([]);
   setFetchError('Unable to load live data. Showing saved local data.');
   return saved;
  }
 };

 useEffect(()=>{
  let isMounted=true;
  refreshAppState().finally(()=>{ if(isMounted)setLoading(false); });
  return ()=>{ isMounted=false; };
 }, []);

 useEffect(()=>{
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
 }, [appState]);

 const { joined, wallet, activity, leaderboard, stats } = appState;
 const handleLogin=(e)=>{
  e.preventDefault();
  const input = document.getElementById('login-name');
  const passwordInput = document.getElementById('login-password');
  const roleInput = document.getElementById('login-role');
  const name = (input?.value || userName || 'Ashutosh Das').trim();
  const password = (passwordInput?.value || '').trim();
  const role = roleInput?.value || 'player';
  fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, password, role }) })
    .then(async (res)=>{
      const data = await res.json();
      if(!res.ok || !data.success){
        notify(data.message || 'Login failed');
        return;
      }
      await refreshAppState();
      setUserName(data.user.name);
      setUserEmail(data.user.email || '');
      setUserRole(data.user.role || 'player');
      setIsLoggedIn(true);
      setPage('dashboard');
      notify(`Welcome back, ${data.user.name}!`);
    })
    .catch(()=>notify('Login failed'));
 };
 const handleSignup=(e)=>{
  e.preventDefault();
  const nameInput = document.getElementById('signup-name');
  const emailInput = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const confirmPasswordInput = document.getElementById('signup-confirm-password');
  const name = (nameInput?.value || 'Ashutosh Das').trim();
  const email = (emailInput?.value || '').trim();
  const password = (passwordInput?.value || '').trim();
  const confirmPassword = (confirmPasswordInput?.value || '').trim();
  fetch('/api/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password, confirmPassword }) })
    .then(async (res)=>{
      const data = await res.json();
      if(!res.ok || !data.success){
        notify(data.message || 'Sign up failed');
        return;
      }
      await refreshAppState();
      setUserName(data.user.name);
      setUserEmail(data.user.email || '');
      setUserRole(data.user.role || 'player');
      setIsLoggedIn(true);
      setPage('profile');
      notify(`Account ready, ${data.user.name}!`);
    })
    .catch(()=>notify('Sign up failed'));
 };
 const handleLogout=()=>{
  fetch('/api/logout', { method:'POST' }).then(()=>{
    localStorage.removeItem(STORAGE_KEY);
    setAppState(getInitialState());
    setIsLoggedIn(false);
    setUserName('Ashutosh Das');
    setUserEmail('');
    setUserRole('player');
    setPage('home');
    notify('You have been logged out.');
  }).catch(()=>{
    localStorage.removeItem(STORAGE_KEY);
    setAppState(getInitialState());
    setIsLoggedIn(false);
    setUserName('Ashutosh Das');
    setUserEmail('');
    setUserRole('player');
    setPage('home');
    notify('You have been logged out.');
  });
 };
 const handleProfileSave=(e)=>{
  e.preventDefault();
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const nextName = (nameInput?.value || userName).trim();
  const nextEmail = (emailInput?.value || '').trim();

  fetch('/api/profile', {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name: nextName, email: nextEmail })
  }).then(async (res)=>{
    const data = await res.json();
    if(!res.ok || !data.success){
      notify(data.message || 'Profile update failed');
      return;
    }
    setUserName(data.user.name);
    setUserEmail(data.user.email || '');
    setUserRole(data.user.role || 'player');
    await refreshAppState();
    notify('Profile updated successfully.');
  }).catch(()=>notify('Profile update failed'));
 };
   const handlePasswordChange=(e)=>{
    e.preventDefault();
    const currentPassword = document.getElementById('current-password')?.value || '';
    const newPassword = document.getElementById('new-password')?.value || '';
    const confirmPassword = document.getElementById('confirm-password')?.value || '';
    fetch('/api/password', {
     method:'PUT',
     headers:{'Content-Type':'application/json'},
     body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    }).then(async (res)=>{
     const data = await res.json();
     if(!res.ok || !data.success){
      notify(data.message || 'Password change failed');
      return;
     }
     e.target.reset();
     notify('Password changed successfully.');
    }).catch(()=>notify('Password change failed'));
   };
 const joinedTournaments = tournaments.filter((t)=>joined.includes(t.id));
 const notify=(text)=>{setToast(text);setTimeout(()=>setToast(''),3000)};
 const addActivity=(label,amount,kind='neutral')=>{
  const entry={
    id:Date.now()+Math.random(),
    label,
    amount,
    kind,
    time:new Date().toLocaleString([], {dateStyle:'medium',timeStyle:'short'})
  };
  setAppState((prev)=>({ ...prev, activity: [entry, ...prev.activity].slice(0,5) }));
 };
 const join=(t)=>{if(joined.includes(t.id))return; if(wallet<t.fee)return notify('Insufficient wallet balance'); fetch('/api/join', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tournamentId: t.id }) }).then((res)=>res.json()).then((data)=>{ if(!data.success){ notify(data.message || 'Unable to join tournament'); return; } setAppState((prev)=>({ ...prev, wallet: data.wallet, joined: data.joined, activity: data.activity })); notify(`You’re in! ${t.title} has been added to My Matches.`); }).catch(()=>{ setAppState((prev)=>({ ...prev, wallet: prev.wallet - t.fee, joined: [...prev.joined, t.id], activity: [{ id: Date.now()+Math.random(), label:`Tournament entry — ${t.title}`, amount:-t.fee, kind:'red', time:new Date().toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) }, ...prev.activity].slice(0,5) })); notify(`You’re in! ${t.title} has been added to My Matches.`); });};
 const handleCreateTournament=(e)=>{
  e.preventDefault();
  const form = e.currentTarget;
  const getFieldValue=(name, fallback='') => form.elements?.namedItem?.(name)?.value ?? fallback;
  const payload = {
    game: getFieldValue('game', 'BGMI'),
    title: getFieldValue('title', ''),
    mode: getFieldValue('mode', 'Squad • Erangel'),
    fee: Number(getFieldValue('fee', '0') || 0),
    prize: getFieldValue('prize', '₹2,000'),
    spots: getFieldValue('spots', '0/100'),
    time: getFieldValue('time', 'Today, 9:00 PM'),
    tag: getFieldValue('tag', 'NEW'),
    color: getFieldValue('color', 'purple'),
    roomId: getFieldValue('roomId', ''),
    roomPassword: getFieldValue('roomPassword', ''),
    startTime: getFieldValue('startTime', getFieldValue('time', 'Today, 9:00 PM')),
    status: getFieldValue('status', 'scheduled')
  };

  fetch('/api/tournaments', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  }).then(async (res)=>{
    const data = await res.json();
    if(!res.ok || !data.success){
      notify(data.message || 'Tournament creation failed');
      return;
    }
    await refreshAppState();
    setShowCreateForm(false);
    notify(`Tournament created: ${data.tournament.title}`);
  }).catch(()=>notify('Tournament creation failed'));
 };
 const handleApproveResult=(resultId)=>{
  fetch(`/api/moderation/${resultId}/approve`, { method:'POST' })
    .then(async (res)=>{
      const data = await res.json();
      if(!res.ok || !data.success){
        notify(data.message || 'Approval failed');
        return;
      }
      await refreshAppState();
      notify('Result approved and payout processed.');
    })
    .catch(()=>notify('Approval failed'));
 };
 const getVisibleTournaments=()=>{
  if(filter==='all')return tournaments;
  if(filter==='BGMI'||filter==='Free Fire MAX')return tournaments.filter((t)=>t.game===filter);
  return tournaments.filter((t)=>t.mode.toLowerCase().includes(filter.toLowerCase()));
 };
 const selectedMatch = tournaments.find((t)=>t.id===selectedMatchId) || joinedTournaments[0] || null;
 useEffect(()=>{ setLobbyOpen(false); }, [selectedMatchId]);
 const openLobby=()=>{ setLobbyOpen(true); notify(`${selectedMatch.title} lobby is ready.`); };
 const Nav=()=> <header><button className="brand" onClick={()=>setPage('home')}><b>PRIZE</b><i>BATTLE</i><span>✦</span></button><nav><button onClick={()=>setPage('tournaments')}>Tournaments</button><button onClick={()=>setPage('leaderboard')}>Leaderboard</button><button onClick={()=>setPage('how')}>How it works</button></nav><div className="navright"><button className="coin" onClick={()=>setPage('wallet')}>◉ ₹{wallet.toLocaleString()}</button>{isLoggedIn ? <button className="avatar" onClick={()=>setPage('profile')} title="Profile">{userName.charAt(0).toUpperCase()}</button> : <button className="avatar" onClick={()=>setPage('login')}>L</button>}</div></header>;
 const TournamentCard=({t})=>{const image=t.game==='BGMI'?'/images/BGMI.jpg':'/images/free_fire.jpg';return <article className={'t-card '+t.color}><div className="game-art"><img className="game-cover" src={image} alt={`${t.game} tournament`} /><span className="game-logo">{t.game==='BGMI'?'BATTLEGROUNDS':'FREE FIRE'}</span><em>{t.tag}</em></div><div className="card-body"><div className="game-line"><span>{t.game}</span><small>{t.mode}</small></div><h3>{t.title}</h3><div className="details"><span>⌚ {t.time}</span><span>♙ {t.spots}</span></div><div className="card-foot"><div><small>Prize Pool</small><strong>{t.prize}</strong></div><button onClick={()=>join(t)} className={joined.includes(t.id)?'joined':''}>{joined.includes(t.id)?'✓ Joined':`Join ₹${t.fee}`}</button></div></div></article>};
 const Home=()=> <><section className="hero"><div className="hero-copy"><p className="eyebrow">INDIA’S GAMING ARENA <span>● LIVE</span></p><h1>Where players<br/><mark>become legends.</mark></h1><p className="sub">Join skill-based gaming tournaments, prove your mettle, and take home real rewards.</p><div className="actions"><button className="primary" onClick={()=>setPage('tournaments')}>Explore tournaments <b>→</b></button><button className="play" onClick={()=>notify('Tournament highlights coming soon!')}>▶ <span>See how it works</span></button></div><div className="hero-stats"><div><strong>25K<span>+</span></strong><small>ACTIVE PLAYERS</small></div><div><strong>₹2.5Cr<span>+</span></strong><small>PRIZES WON</small></div><div><strong>1.2K<span>+</span></strong><small>TOURNAMENTS</small></div></div></div><div className="hero-visual"><div className="orb one"></div><div className="orb two"></div><div className="rays"></div><div className="player-silhouette">♟</div><div className="badge top">⚡<small>POWER PLAY</small></div><div className="badge bottom"><b>₹ 5,000</b><small>PRIZE POOL</small></div><div className="hero-game"><span>BGMI</span><b>MIDNIGHT<br/>MAYHEM</b><small>TONIGHT • 9:00 PM</small></div></div></section><section className="featured"><div className="section-head"><div><p className="eyebrow">FIND YOUR ARENA</p><h2>Live & upcoming battles</h2></div><button className="text-btn" onClick={()=>setPage('tournaments')}>View all tournaments →</button></div>{loading ? <div className="empty"><span>♟</span><b>Loading live battles…</b><small>Fetching tournament data.</small></div> : <div className="card-grid">{tournaments.map(t=><TournamentCard t={t} key={t.id}/>)}</div>}</section><section className="strip"><span>🔥 COMPETE</span><i></i><span>🏆 DOMINATE</span><i></i><span>✦ GET REWARDED</span></section></>;
 const Tournaments=()=> <main className="inner"><div className="page-title"><p className="eyebrow">CHOOSE YOUR BATTLEGROUND</p><h1>Find your next win.</h1><div className="filters">{['all','BGMI','Free Fire MAX','Solo','Squad'].map((option)=><button key={option} className={filter===option?'active':''} onClick={()=>setFilter(option)}>{option==='all'?'All games':option}</button>)}</div></div><div style={{display:'flex',justifyContent:'flex-end',marginBottom:'18px'}}><button className="primary" onClick={()=>setShowCreateForm((prev)=>!prev)}>{showCreateForm ? 'Close form' : 'Create tournament'}</button></div>{showCreateForm && <form onSubmit={handleCreateTournament} style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'12px',background:'#fff',padding:'18px',borderRadius:'16px',border:'1px solid #edeaf1',marginBottom:'20px'}}><input name="game" placeholder="Game" defaultValue="BGMI" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="title" placeholder="Tournament title" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="mode" placeholder="Mode" defaultValue="Squad • Erangel" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="fee" placeholder="Entry fee" type="number" defaultValue="50" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="prize" placeholder="Prize pool" defaultValue="₹5,000" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="spots" placeholder="Spots" defaultValue="0/100" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="time" placeholder="Time" defaultValue="Today, 9:00 PM" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input name="tag" placeholder="Tag" defaultValue="NEW" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><select name="color" defaultValue="purple" style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}}><option value="purple">Purple</option><option value="orange">Orange</option><option value="blue">Blue</option></select><button type="submit" className="primary" style={{gridColumn:'1 / -1'}}>Save tournament</button></form>}{loading ? <div className="empty"><span>♟</span><b>Loading tournaments…</b><small>Please wait while we fetch the latest battles.</small></div> : getVisibleTournaments().length ? <div className="card-grid all">{getVisibleTournaments().map((t)=><TournamentCard t={t} key={t.id}/>)}</div> : <div className="empty"><span>♟</span><b>No tournaments match this filter</b><small>Try another mode or game to see more matches.</small><button className="primary" onClick={()=>setFilter('all')}>Show all tournaments</button></div>}</main>;
 const Dashboard=()=> <main className="dash"><aside><div className="profile"><div className="big-avatar">A</div><b>{userName}</b><small>Player since Aug 2025</small></div>{[['▦','Overview'],['♟','My Tournaments'],['◉','Wallet'],['◷','Match History'],['♕','Achievements'],['⚙','Settings']].map(([i,x])=><button key={x} className={x==='Overview'?'side-active':''} onClick={()=>x==='Wallet'&&setPage('wallet')}><Icon>{i}</Icon>{x}</button>)}</aside><div className="dash-main"><div className="welcome"><div><p>WEDNESDAY, AUGUST 05</p><h1>Good evening, {userName.split(' ')[0]} <span>✦</span></h1><small>Ready to claim your next victory?</small></div><button className="primary" onClick={()=>setPage('tournaments')}>Join a battle →</button></div><div className="stat-cards"><div><span>◉</span><small>WALLET BALANCE</small><b>₹{wallet.toLocaleString()}</b><button onClick={()=>setPage('wallet')}>Manage wallet →</button></div><div><span>♕</span><small>TOTAL WINNINGS</small><b>₹{stats.winnings.toLocaleString()}</b><em>↑ 18% this month</em></div><div><span>⚔</span><small>MATCHES PLAYED</small><b>{stats.matches}</b><em>{stats.wins} wins • {Math.round((stats.wins/stats.matches)*100)}% win rate</em></div></div><div className="dash-section"><div className="section-head"><h2>Upcoming matches</h2><button className="text-btn" onClick={()=>setPage('tournaments')}>View all →</button></div>{joinedTournaments.length?joinedTournaments.map((t)=><div className="match-row" key={t.id}><div className="match-icon">{t.game==='BGMI'?'BG':'FF'}</div><div><b>{t.title}</b><small>{t.game} • {t.mode}</small></div><div><small>ROOM OPENS</small><b>{t.time.split(',').slice(-1)[0].trim()}</b></div><div><small>STATUS</small><em className="green">CONFIRMED</em></div><button onClick={()=>{setSelectedMatchId(t.id);setPage('match')}}>View details →</button></div>):<div className="empty"><span>♟</span><b>No upcoming matches yet</b><small>Your next victory is waiting for you.</small><button className="primary" onClick={()=>setPage('tournaments')}>Browse tournaments</button></div>}</div></div></main>;
 const Wallet=()=> <main className="wallet-page"><button className="back" onClick={()=>setPage('dashboard')}>← Back to dashboard</button><h1>Your wallet</h1><div className="wallet-card"><div><small>AVAILABLE BALANCE</small><b>₹{wallet.toLocaleString()}</b><p>Use it to join any paid tournament.</p></div><div><button className="primary" onClick={()=>{ fetch('/api/wallet/add',{method:'POST'}).then((res)=>res.json()).then((data)=>{ if(data.success){ setAppState((prev)=>({ ...prev, wallet: data.wallet, activity: data.activity })); notify('₹500 added to your wallet'); } }).catch(()=>{ setAppState((prev)=>({ ...prev, wallet: prev.wallet + 500, activity: [{id:Date.now()+Math.random(),label:'Wallet top-up',amount:500,kind:'green',time:new Date().toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}, ...prev.activity].slice(0,5) })); notify('₹500 added to your wallet'); }); }}>＋ Add money</button><button className="secondary" onClick={()=>{ fetch('/api/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ amount: 200 })}).then((res)=>res.json()).then((data)=>{ if(data.success){ setAppState((prev)=>({ ...prev, wallet: data.wallet, activity: data.activity })); notify('₹200 withdrawal processed'); } else { notify(data.message || 'Withdrawal failed'); } }).catch(()=>{ setAppState((prev)=>({ ...prev, wallet: Math.max(0, prev.wallet - 200), activity: [{id:Date.now()+Math.random(),label:'Withdrawal request',amount:-200,kind:'red',time:new Date().toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}, ...prev.activity].slice(0,5) })); notify('₹200 withdrawal processed'); }); }}>Withdraw ↗</button></div><div className="wallet-glow"></div></div><div className="wallet-layout"><section><div className="section-head"><h2>Recent activity</h2><button className="text-btn">View all →</button></div>{activity.length ? activity.map((entry)=><div className="txn" key={entry.id}><span className={entry.kind}>{entry.kind==='green'?'↓':'↑'}</span><div><b>{entry.label}</b><small>{entry.time}</small></div><strong className={entry.kind}>{entry.amount > 0 ? `+ ₹${entry.amount}` : `− ₹${Math.abs(entry.amount)}`}</strong></div>) : <div className="empty"><span>◉</span><b>No activity yet</b><small>Your wallet movements will appear here.</small></div>}</section><section className="bonus"><p>YOUR BONUS WALLET</p><b>₹180</b><small>Use on eligible events</small><button>Explore eligible battles →</button></section></div></main>;
 const MatchDetail=()=> selectedMatch ? <main className="inner"><button className="back" onClick={()=>setPage('dashboard')}>← Back to dashboard</button><div className="page-title"><p className="eyebrow">MATCH DETAILS</p><h1>{selectedMatch.title}</h1><p>{selectedMatch.game} • {selectedMatch.mode}</p></div><div className="wallet-card"><div><small>ENTRY FEE</small><b>{selectedMatch.prize}</b><p>Prize pool • {selectedMatch.prize}</p></div><div><button className="primary" onClick={openLobby}>Open lobby</button><button className="secondary" onClick={()=>setPage('tournaments')}>Browse more</button></div><div className="wallet-glow"></div></div>{lobbyOpen && <div className="wallet-card" style={{marginTop:'20px',background:'linear-gradient(135deg,#121225,#1c1b3a)'}}><div><small>LOBBY STATUS</small><b style={{color:'#d9ff52'}}>READY</b><p>Room code: {selectedMatch.id.toString().padStart(6,'0')} • Team slots 4/4</p></div><div><button className="primary" onClick={()=>{ setPage('lobby'); notify(`Joined ${selectedMatch.title} lobby.`); }}>Join room</button><button className="secondary" onClick={()=>notify('Match briefing opened')}>Briefing</button></div><div className="wallet-glow"></div></div>}<div className="wallet-layout"><section><div className="section-head"><h2>Match snapshot</h2></div><div className="txn"><span className="green">↓</span><div><b>Starts</b><small>{selectedMatch.time}</small></div><strong className="green">{lobbyOpen ? 'Live' : 'Scheduled'}</strong></div><div className="txn"><span className="red">↑</span><div><b>Slots</b><small>{selectedMatch.spots}</small></div><strong className="red">{lobbyOpen ? 'Open' : 'Waiting'}</strong></div></section><section className="bonus"><p>REWARD TRACK</p><b>{selectedMatch.prize}</b><small>Top 10 players split the pool</small><button onClick={()=>setPage('tournaments')}>Explore eligible battles →</button></section></div></main> : <main className="inner"><button className="back" onClick={()=>setPage('dashboard')}>← Back to dashboard</button><div className="empty"><span>♟</span><b>No match selected</b><small>Choose a match from your dashboard to view details.</small></div></main>;
 const Lobby=()=>{
  const roomCode = selectedMatch?.roomId || (selectedMatch?.id ?? 1).toString().padStart(6,'0');
  const roomPassword = selectedMatch?.roomPassword || 'Not shared yet';
  const squad = ['You', 'Rogue', 'Kite', 'Vex', 'Nova'];
  return <main className="inner"><button className="back" onClick={()=>setPage('match')}>← Back to match</button><div className="page-title"><p className="eyebrow">LOBBY</p><h1>{selectedMatch?.title || 'Match lobby'}</h1><p>{selectedMatch?.game} • {selectedMatch?.mode}</p></div><div className="wallet-card" style={{background:'linear-gradient(135deg,#15182d,#212a44)'}}><div><small>ROOM ID</small><b style={{color:'#d9ff52'}}>{roomCode}</b><p><strong>Password:</strong> {roomPassword} • Match starts {selectedMatch?.startTime || selectedMatch?.time || 'soon'} • 5 players ready</p></div><div><button className="primary" onClick={()=>{ setPage('summary'); notify('Squad is synced and ready.'); }}>Ready up</button><button className="secondary" onClick={()=>notify('Voice chat opened')}>Voice chat</button></div><div className="wallet-glow"></div></div><div className="wallet-layout"><section><div className="section-head"><h2>Squad roster</h2></div>{squad.map((player,index)=><div className="txn" key={player}><span className={index===0 ? 'green' : 'red'}>{index===0 ? '✓' : '◎'}</span><div><b>{player}</b><small>{index===0 ? 'Captain • Ready' : 'Ready'}</small></div><strong className={index===0 ? 'green' : 'red'}>{index===0 ? 'Leader' : 'Ready'}</strong></div>)}</section><section className="bonus"><p>LOBBY BRIEF</p><b>Team plan</b><small>Rotate high-ground pushes in Erangel</small><button onClick={()=>setPage('dashboard')}>Return to dashboard →</button></section></div></main>;
 };
 const Summary=()=> {
  const submitResult=(e)=>{
    e.preventDefault();
    const form = e.currentTarget;
    const placement = Number(form.placement.value || 2);
    const kills = Number(form.kills.value || 0);
    const reward = placement === 1 ? 1200 : placement === 2 ? 800 : placement <= 5 ? 250 : 0;

    fetch('/api/match-results', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: selectedMatch.title, placement, kills, reward })
    }).then(async (res)=>{
      const data = await res.json();
      if(!res.ok || !data.success){
        notify(data.message || 'Result submission failed');
        return;
      }
      notify(`Result submitted for moderation: placement #${placement} • reward ₹${reward}.`);
      setPage('dashboard');
      await refreshAppState();
    }).catch(()=>notify('Result submission failed'));
  };

  return selectedMatch ? <main className="inner"><button className="back" onClick={()=>setPage('lobby')}>← Back to lobby</button><div className="page-title"><p className="eyebrow">MATCH SUMMARY</p><h1>{selectedMatch.title}</h1><p>{selectedMatch.game} • {selectedMatch.mode}</p></div><div className="wallet-card"><div><small>RESULT</small><b style={{color:'#d9ff52'}}>Victory</b><p>{selectedMatch.title} concluded with your squad placing 2nd.</p></div><div><button className="primary" onClick={()=>notify('Rewards are being processed.')}>Claim rewards</button><button className="secondary" onClick={()=>setPage('dashboard')}>Back to dashboard</button></div><div className="wallet-glow"></div></div><div className="wallet-layout"><section><div className="section-head"><h2>Scoreboard</h2></div><div className="txn"><span className="green">1</span><div><b>PrizeBattle squad</b><small>Top 10 finish</small></div><strong className="green">₹4,250</strong></div><div className="txn"><span className="red">2</span><div><b>RogueKiller</b><small>3 kills</small></div><strong className="red">₹3,600</strong></div></section><section className="bonus"><p>PLAYER FEED</p><b>+₹1,200</b><small>Wallet updated from match payout</small><button onClick={()=>setPage('wallet')}>Open wallet →</button></section></div><form onSubmit={submitResult} style={{display:'grid', gap:'12px', marginTop:'20px', padding:'18px', background:'#fff', borderRadius:'16px', border:'1px solid #edeaf1'}}><h3 style={{margin:0}}>Submit match result</h3><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}><label style={{display:'grid', gap:'8px'}}><small>Placements</small><input name="placement" type="number" min="1" max="20" defaultValue="2" style={{padding:'10px 12px', borderRadius:'10px', border:'1px solid #ddd'}} /></label><label style={{display:'grid', gap:'8px'}}><small>Kills</small><input name="kills" type="number" min="0" defaultValue="3" style={{padding:'10px 12px', borderRadius:'10px', border:'1px solid #ddd'}} /></label></div><button type="submit" className="primary">Submit result</button></form></main> : <main className="inner"><button className="back" onClick={()=>setPage('dashboard')}>← Back to dashboard</button><div className="empty"><span>♟</span><b>No match selected</b><small>Choose a match from your dashboard to view the summary.</small></div></main>;
 };
 const Leaderboard=()=> <main className="inner leaderboard"><div className="page-title"><p className="eyebrow">HALL OF FAME</p><h1>Legends of the arena.</h1><p>Top players winning big, one battle at a time.</p></div><div className="podium"><div className="place two"><div>RK</div><b>RogueKiller</b><small>₹42,800 won</small><em>#2</em></div><div className="place one"><div>VK</div><b>ViperKing</b><small>₹68,240 won</small><em>♛ #1</em></div><div className="place three"><div>SN</div><b>ShadowNinja</b><small>₹37,590 won</small><em>#3</em></div></div><section className="rankings"><div className="rank-head"><b>Rank</b><b>Player</b><b>Matches</b><b>Win rate</b><b>Earnings</b></div>{leaderboard.map((player)=><div className="rank" key={player.rank}>{[player.rank,player.name,player.matches,player.winRate,player.earnings].map((value,index)=><span key={`${player.rank}-${index}`}>{index===1&&<i>{value.slice(0,2)}</i>}{value}</span>)}</div>)}</section></main>;
 const Login=()=> <main className="inner"><div className="page-title"><p className="eyebrow">WELCOME BACK</p><h1>Log in to your arena.</h1></div><form className="empty" onSubmit={handleLogin} style={{display:'grid',gap:'14px',maxWidth:'420px',margin:'40px auto 0'}}><select id="login-role" defaultValue="player" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}}><option value="player">Log in as player</option><option value="admin">Log in as admin</option></select><input id="login-name" defaultValue={userName} placeholder="Username" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><input id="login-password" type="password" placeholder="Password" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><button type="submit" className="primary">Continue to dashboard</button><button type="button" className="secondary" onClick={()=>setPage('signup')}>Create an account</button></form></main>;
 const Signup=()=> <main className="inner"><div className="page-title"><p className="eyebrow">JOIN PRIZEBATTLE</p><h1>Create your player profile.</h1></div><form className="empty" onSubmit={handleSignup} style={{display:'grid',gap:'14px',maxWidth:'420px',margin:'40px auto 0'}}><input id="signup-name" defaultValue={userName} placeholder="Your player name" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><input id="signup-email" type="email" placeholder="Email address" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><input id="signup-password" type="password" placeholder="Create a password" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><input id="signup-confirm-password" type="password" placeholder="Confirm password" style={{padding:'14px 16px',borderRadius:'10px',border:'1px solid #ddd',fontSize:'16px'}} /><small style={{color:'#5d6478'}}>Use at least 6 characters.</small><button type="submit" className="primary">Create account</button><button type="button" className="secondary" onClick={()=>setPage('login')}>Back to login</button></form></main>;
 const Profile=()=> <main className="inner"><div className="page-title"><p className="eyebrow">{userRole==='admin'?'ADMIN PROFILE':'PLAYER PROFILE'}</p><h1>{userName}</h1></div><div className="wallet-card"><div><small>MEMBER SINCE</small><b>Aug 2026</b><p>{userEmail ? userEmail : 'No email linked yet'}</p><p>Your {userRole} account is synced with the live session.</p></div><div><button className="primary" onClick={()=>setPage('dashboard')}>Go to dashboard</button><button className="secondary" onClick={handleLogout}>Log out</button></div><div className="wallet-glow"></div></div><form onSubmit={handleProfileSave} style={{display:'grid',gap:'12px',marginTop:'20px',padding:'18px',background:'#fff',borderRadius:'16px',border:'1px solid #edeaf1'}}><h3 style={{margin:0}}>Edit profile</h3><label style={{display:'grid',gap:'8px'}}><small>Username</small><input id="profile-name" defaultValue={userName} style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /></label><label style={{display:'grid',gap:'8px'}}><small>Email</small><input id="profile-email" type="email" defaultValue={userEmail} style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /></label><button type="submit" className="primary">Save changes</button></form><form onSubmit={handlePasswordChange} style={{display:'grid',gap:'12px',marginTop:'20px',padding:'18px',background:'#fff',borderRadius:'16px',border:'1px solid #edeaf1'}}><h3 style={{margin:0}}>Change password</h3><input id="current-password" type="password" placeholder="Current password" required style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input id="new-password" type="password" placeholder="New password (6+ characters)" required style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><input id="confirm-password" type="password" placeholder="Confirm new password" required style={{padding:'10px 12px',borderRadius:'10px',border:'1px solid #ddd'}} /><button type="submit" className="primary">Update password</button></form><div className="wallet-layout"><section><div className="section-head"><h2>Joined tournaments</h2></div>{joinedTournaments.length ? joinedTournaments.map((t)=><div className="txn" key={t.id}><span className="green">✓</span><div><b>{t.title}</b><small>{t.game} • {t.mode}</small></div><strong className="green">{t.time}</strong></div>) : <div className="empty"><span>♟</span><b>No joined tournaments yet</b><small>Your upcoming battles will show up here.</small></div>}</section><section className="bonus"><p>PLAYER SUMMARY</p><b>₹{wallet.toLocaleString()}</b><small>{stats.matches} matches played • {stats.wins} wins</small><button onClick={()=>setPage('wallet')}>View wallet →</button></section></div></main>;
 const How=()=> <main className="inner how"><div className="page-title"><p className="eyebrow">IT’S EASY TO START</p><h1>Play hard. Win real.</h1></div><div className="steps">{[['01','Pick a battle','Browse tournaments by game, mode and prize pool.'],['02','Secure your spot','Pay the entry fee from your PrizeBattle wallet.'],['03','Play & submit','Join the room, play your best, and submit results.'],['04','Claim rewards','Winnings land in your wallet after verification.']].map(s=><article key={s[0]}><em>{s[0]}</em><span>{s[0]==='01'?'⌁':s[0]==='02'?'◉':s[0]==='03'?'⚔':'♕'}</span><h2>{s[1]}</h2><p>{s[2]}</p></article>)}</div></main>;
 let content=page==='home'?<Home/>:page==='tournaments'?<Tournaments/>:page==='dashboard'?<Dashboard/>:page==='wallet'?<Wallet/>:page==='leaderboard'?<Leaderboard/>:page==='match'?<MatchDetail/>:page==='lobby'?<Lobby/>:page==='summary'?<Summary/>:page==='login'?<Login/>:page==='signup'?<Signup/>:page==='profile'?<Profile/>:<How/>;
 return <><Nav/>{fetchError && <div className="toast">⚠ {fetchError}</div>}{content}{page==='login' && firebaseEnabled && <PhoneLogin onLogin={notify}/>} {toast&&<div className="toast">✓ {toast}</div>}<footer><button className="brand"><b>PRIZE</b><i>BATTLE</i><span>✦</span></button><p>© 2026 PrizeBattle. Built for players who play to win.</p><div>Terms & Conditions &nbsp; Privacy &nbsp; Support</div></footer></>
}
createRoot(document.getElementById('root')).render(<App/>);
