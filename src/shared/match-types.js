/**
 * Shared Match Data Model & Default Template Rosters
 * Phase 2: Esports Broadcast Controller & Live Overlay System
 *
 * Canonical 10-column CSV schema:
 * Key,TeamName,Player1,Player2,Player3,Player4,pos,KP,PP,TT
 */

import { TEAM_KEYS_AZ } from './constants.js';

export const DEFAULT_BGMI_ROSTER = [
  { Key: 'A', TeamName: 'GodLike', Player1: 'Jonathan', Player2: 'Punk', Player3: 'Jeyy', Player4: 'Admino' },
  { Key: 'B', TeamName: 'Team Soul', Player1: 'Manya', Player2: 'Spower', Player3: 'Nakul', Player4: 'Rony' },
  { Key: 'C', TeamName: 'Entity Gaming', Player1: 'Saumraj', Player2: 'Trojan', Player3: 'Gamla', Player4: 'Aquanox' },
  { Key: 'D', TeamName: 'MH ELITE', Player1: 'MHE·Shadow', Player2: 'MHE·Viper', Player3: 'MHE·Kratos', Player4: 'MHE·Blaze' },
  { Key: 'E', TeamName: 'Kill Warriors', Player1: 'KW·Raptor', Player2: 'KW·Hunter', Player3: 'KW·Storm', Player4: 'KW·Nexus' },
  { Key: 'F', TeamName: 'WARRIORS', Player1: 'WAR·Titan', Player2: 'WAR·Ghost', Player3: 'WAR·Fury', Player4: 'WAR·Sniper' },
  { Key: 'G', TeamName: 'Nitro', Player1: 'NTR·Volt', Player2: 'NTR·Pulse', Player3: 'NTR·Turbo', Player4: 'NTR·Drift' },
  { Key: 'H', TeamName: 'X-FACTOR', Player1: 'XFC·Zero', Player2: 'XFC·Omega', Player3: 'XFC·Delta', Player4: 'XFC·Sigma' },
  { Key: 'I', TeamName: 'Roopam squad', Player1: 'RPM·Roopam', Player2: 'RPM·Aryan', Player3: 'RPM·Karan', Player4: 'RPM·Dev' },
  { Key: 'J', TeamName: 'Rocket Launcher', Player1: 'RKL·Boom', Player2: 'RKL·Salvo', Player3: 'RKL·Barrage', Player4: 'RKL·Mortar' },
  { Key: 'K', TeamName: 'Advait', Player1: 'ADV·Advait', Player2: 'ADV·Rudra', Player3: 'ADV·Veer', Player4: 'ADV·Yash' },
  { Key: 'L', TeamName: 'Team Tss', Player1: 'TSS·Alpha', Player2: 'TSS·Bravo', Player3: 'TSS·Charlie', Player4: 'TSS·Echo' },
  { Key: 'M', TeamName: 'Team APEX gaming', Player1: 'APX·Legend', Player2: 'APX·Vortex', Player3: 'APX·Cipher', Player4: 'APX·Havoc' },
  { Key: 'N', TeamName: 'OG WARRIOR', Player1: 'OGW·King', Player2: 'OGW·Beast', Player3: 'OGW·Clutch', Player4: 'OGW·Demon' },
  { Key: 'O', TeamName: 'DogLikeOGs', Player1: 'DLO·Hound', Player2: 'DLO·Wolf', Player3: 'DLO·Fang', Player4: 'DLO·Claw' },
  { Key: 'P', TeamName: 'Dhurandhar', Player1: 'DHR·Surya', Player2: 'DHR·Vikram', Player3: 'DHR·Arjun', Player4: 'DHR·Bheem' },
  { Key: 'Q', TeamName: 'Darinda gang', Player1: 'DRG·Loki', Player2: 'DRG·Bane', Player3: 'DRG·Venom', Player4: 'DRG·Carnage' },
  { Key: 'R', TeamName: 'Wearefirst', Player1: 'WAF·Prime', Player2: 'WAF·Ace', Player3: 'WAF·Nova', Player4: 'WAF·Zenith' },
  { Key: 'S', TeamName: 'Binpagari', Player1: 'BPG·Rebel', Player2: 'BPG·Rogue', Player3: 'BPG·Nomad', Player4: 'BPG·Outlaw' },
  { Key: 'T', TeamName: 'Death note', Player1: 'DTN·Kira', Player2: 'DTN·Ryuk', Player3: 'DTN·Lawliet', Player4: 'DTN·Misa' },
  { Key: 'U', TeamName: 'Crimson Vanguard', Player1: 'CRV·Ares', Player2: 'CRV·Helios', Player3: 'CRV·Draco', Player4: 'CRV·Orion' },
  { Key: 'V', TeamName: 'Phantom Syndicate', Player1: 'PHS·Spectre', Player2: 'PHS·Wraith', Player3: 'PHS·Shade', Player4: 'PHS·Mirage' },
  { Key: 'W', TeamName: 'Valiant Esports', Player1: 'VLN·Knight', Player2: 'VLN·Paladin', Player3: 'VLN·Lancer', Player4: 'VLN·Aegis' },
  { Key: 'X', TeamName: 'Ironclad Seven', Player1: 'IC7·Forge', Player2: 'IC7·Anvil', Player3: 'IC7·Steel', Player4: 'IC7·Cobalt' },
  { Key: 'Y', TeamName: 'Solaris Recon', Player1: 'SLR·Flare', Player2: 'SLR·Photon', Player3: 'SLR·Eclipse', Player4: 'SLR·Corona' },
  { Key: 'Z', TeamName: 'Omega Horizon', Player1: 'OMH·Vector', Player2: 'OMH·Matrix', Player3: 'OMH·Tensor', Player4: 'OMH·Vertex' },
];

export const DEFAULT_FF_ROSTER = DEFAULT_BGMI_ROSTER.map((row, idx) => ({
  ...row,
  TeamName:
    idx === 0
      ? 'Total Gaming FF'
      : idx === 1
      ? 'Team Elite FF'
      : idx === 2
      ? 'Sixth Sense FF'
      : row.TeamName,
}));

/**
 * Normalizes a raw team record into the canonical 10-field + derived UI properties structure.
 */
export function createCanonicalTeam(raw) {
  const key = String(raw.Key || raw.slotKey || 'A').trim().toUpperCase();
  const teamName = String(raw.TeamName || raw.teamName || `Team ${key}`).trim();
  const p1 = String(raw.Player1 ?? raw.players?.[0] ?? `${key}·Player1`).trim();
  const p2 = String(raw.Player2 ?? raw.players?.[1] ?? `${key}·Player2`).trim();
  const p3 = String(raw.Player3 ?? raw.players?.[2] ?? `${key}·Player3`).trim();
  const p4 = String(raw.Player4 ?? raw.players?.[3] ?? `${key}·Player4`).trim();

  const pos = Number.isInteger(Number(raw.pos)) ? Number(raw.pos) : 0;
  const KP = Number.isInteger(Number(raw.KP ?? raw.kp))
    ? Number(raw.KP ?? raw.kp)
    : 0;
  const PP = Number.isInteger(Number(raw.PP ?? raw.pp))
    ? Number(raw.PP ?? raw.pp)
    : 0;
  const TT = KP + PP;
  const isEliminated = pos > 0;

  return {
    // 10 Canonical CSV fields
    Key: key,
    TeamName: teamName,
    Player1: p1,
    Player2: p2,
    Player3: p3,
    Player4: p4,
    pos,
    KP,
    PP,
    TT,

    // Derived convenience fields for Control Deck & Overlay compatibility
    slotKey: key,
    teamName,
    players: [p1, p2, p3, p4],
    kp: KP,
    pp: PP,
    tt: TT,
    status: isEliminated ? 'ELIMINATED' : 'ALIVE',
    aliveCount: isEliminated ? 0 : 4,
  };
}

/**
 * Builds a clean 26-team roster initialized to pos=0, KP=0, PP=0, TT=0.
 * @param {'BGMI' | 'FREE_FIRE'} game
 */
export function buildDefaultTemplateTeams(game = 'BGMI') {
  const source = game === 'FREE_FIRE' ? DEFAULT_FF_ROSTER : DEFAULT_BGMI_ROSTER;
  return TEAM_KEYS_AZ.map((key, idx) => {
    const base = source[idx] || {
      Key: key,
      TeamName: `Squad ${key}`,
      Player1: `${key}·Player1`,
      Player2: `${key}·Player2`,
      Player3: `${key}·Player3`,
      Player4: `${key}·Player4`,
    };
    return createCanonicalTeam({
      ...base,
      Key: key,
      pos: 0,
      KP: 0,
      PP: 0,
      TT: 0,
    });
  });
}
