#include "arena.hpp"

#include <algorithm>
#include <cmath>

namespace cau {

namespace {
constexpr double kTile = 16;
constexpr double kPi = 3.14159265358979323846;
double clamp(double v, double lo, double hi) { return std::max(lo, std::min(hi, v)); }
double lerp(double a, double b, double t) { return a + (b - a) * t; }
}  // namespace

ArenaSim::ArenaSim(const GameData& data, const ArenaConfig& cfg)
    : data_(data), B_(data.balance()), A_(data.balance()["arena"]), rng_(cfg.seed) {
  course_ = data.course(cfg.courseId);
  prof_ = data.professor(course_.professor);
  room_ = data.room(course_.arena);
  stage_ = buildStage(data, cfg.courseId, cfg.stageIndex);

  const Json& semi = B_["ammo"]["semicolon"];
  auto has = [&](const std::string& id) { return std::find(cfg.upgrades.begin(), cfg.upgrades.end(), id) != cfg.upgrades.end(); };
  auto modifier = [&](const std::string& id) -> const Json& {
    for (const Json& u : B_["upgrades"].elements()) if (u["id"].str() == id) return u["modifier"];
    return B_["__none__"];
  };
  clipMax_ = has("more_ram") ? modifier("more_ram")["set"].integer(semi["clip"].integer()) : semi["clip"].integer();
  reloadTime_ = semi["reloadSeconds"].num() * (has("ssd") ? modifier("ssd")["multiply"].num(1) : 1);
  splashMult_ = has("bigger_mug") ? modifier("bigger_mug")["multiply"].num(1) : 1;
  clip_ = clipMax_;
  sanityMax_ = B_["player"]["sanity"].num(100);
  sanity_ = sanityMax_;
  deadline_ = stage_.deadline;
  total_ = std::max(1.0, stageTotalHp(stage_));
  eightAm_ = !cfg.firstCoffee;
  ammoMac_ = cfg.maccoffee;
  ammoNes_ = cfg.nescafe;

  bounds_ = {kTile, kTile * 2, room_.width * kTile - kTile * 2, room_.height * kTile - kTile * 3};
  for (const Rect& d : room_.desks) desks_.push_back({d.x * kTile, d.y * kTile, d.w * kTile, d.h * kTile});
  pl_.x = room_.startX * kTile + 8;
  pl_.y = room_.startY * kTile + 8;

  papers_.resize(140);
  shots_.resize(80);
  eshots_.resize(260);
  spriteR_.assign(data.enemies().size(), 6);
  wallX_ = bounds_.x - 20;

  for (const RoomPickup& p : room_.pickups) {
    if (p.type == "feynman_lectures" && course_.shieldPickup != "feynman_lectures") continue;
    addPickup(p.type, p.x * kTile + 8, p.y * kTile + 8);
  }
  if (cfg.lunch) addPickup("canteen_food", pl_.x + 24, pl_.y - 8);

  attendanceAt_ = A_["attendanceChance"].num() > rng_.uniform() ? stage_.deadline * (0.3 + rng_.uniform() * 0.3) : -1;
  if (!stage_.boss.empty()) spawnBoss(stage_.boss);
}

void ArenaSim::setSpriteSize(const std::string& kind, double w, double h) {
  const int k = data_.enemyIndex(kind);
  if (k >= 0) spriteR_[static_cast<size_t>(k)] = std::max(w, h) * 0.38;
}

void ArenaSim::emit(Ev t, const std::string& key, double x, double y, double a, double b, int tone) {
  events_.push_back({t, key, x, y, a, b, tone});
}

std::vector<Event> ArenaSim::takeEvents() {
  std::vector<Event> out;
  out.swap(events_);
  return out;
}

int ArenaSim::activeEnemies() const {
  int n = boss_.alive ? 1 : 0;
  for (const Paper& p : papers_) n += p.active ? 1 : 0;
  return n;
}

// ---------------------------------------------------------------- player

bool ArenaSim::overlapsDesk(double l, double t, double r, double b) const {
  for (const Rect& d : desks_) if (r > d.x && l < d.x + d.w && b > d.y && t < d.y + d.h) return true;
  return false;
}

void ArenaSim::movePlayer(double dt, const ArenaInput& in) {
  const Json& P = B_["player"];
  pl_.dashCooldown = std::max(0.0, pl_.dashCooldown - dt);
  pl_.invuln = std::max(0.0, pl_.invuln - dt);
  const double dashInv = P["dash"]["invulnerable"].num(0.25);
  if (in.dash && pl_.dashCooldown <= 0) {
    const double len = std::hypot(in.moveX, in.moveY);
    if (len > 0.1) { pl_.dashX = in.moveX / len; pl_.dashY = in.moveY / len; }
    else { pl_.dashX = pl_.facing; pl_.dashY = 0; }
    pl_.dashTimer = dashInv;
    pl_.dashCooldown = P["dash"]["cooldown"].num(1.5);
    pl_.invuln = std::max(pl_.invuln, dashInv);
    sfx("dash");
  }
  if (pl_.dashTimer > 0) {
    pl_.dashTimer -= dt;
    const double v = P["dash"]["distance"].num(48) / dashInv;
    pl_.vx = pl_.dashX * v;
    pl_.vy = pl_.dashY * v;
  } else {
    const double sp = P["speed"].num(90) * (eightAm_ ? B_["hazards"]["eight_am"]["speedMultiplier"].num(1) : 1);
    pl_.vx = in.moveX * sp;
    pl_.vy = in.moveY * sp;
  }
  if (std::fabs(pl_.vx) > 5) pl_.facing = pl_.vx > 0 ? 1 : -1;

  // The feet are a 10x7 box; collide it with the room walls and desks one axis at a time.
  auto box = [&](double x, double y, double& l, double& t, double& r, double& b) { l = x - 5; r = x + 5; t = y - 7; b = y; };
  double l, t, r, b;
  double nx = pl_.x + pl_.vx * dt;
  box(nx, pl_.y, l, t, r, b);
  if (overlapsDesk(l, t, r, b)) nx = pl_.x;
  nx = clamp(nx, bounds_.x + 5, bounds_.x + bounds_.w - 5);
  double ny = pl_.y + pl_.vy * dt;
  box(nx, ny, l, t, r, b);
  if (overlapsDesk(l, t, r, b)) ny = pl_.y;
  ny = clamp(ny, bounds_.y + 7, bounds_.y + bounds_.h);
  pl_.x = nx;
  pl_.y = ny;
}

// ---------------------------------------------------------------- spawning

void ArenaSim::addPickup(const std::string& type, double x, double y) {
  pickups_.push_back({true, type, x, y});
  emit(Ev::PickupSpawn, type, x, y, static_cast<double>(pickups_.size() - 1));
}

Paper* ArenaSim::spawnPaper(const std::string& kind, double x, double y, double hp, bool primary) {
  auto it = std::find_if(papers_.begin(), papers_.end(), [](const Paper& p) { return !p.active; });
  if (it == papers_.end()) return nullptr;
  const EnemyDef& d = data_.enemy(kind);
  Paper& p = *it;
  p = Paper{};
  p.active = true;
  p.primary = primary;
  p.kind = data_.enemyIndex(kind);
  p.x = x;
  p.y = y;
  p.hp = p.maxHp = hp > 0 ? hp : d.hp;
  p.shotTimer = (d.shoots ? d.shotEvery : 2) * (0.5 + rng_.uniform() * 0.5);
  p.jitter = rng_.uniform() * kPi * 2;
  p.spawnT = 0.35;
  p.r = spriteR_[static_cast<size_t>(p.kind)];
  if (d.idleTeammates > 0 && !teammatesShown_) {
    teammatesShown_ = true;
    emit(Ev::Teammates, "", pl_.x - 30, bounds_.y + bounds_.h - 12, d.idleTeammates);
    toast("ui.teammatesNote", ToneDim);
  }
  return &p;
}

Paper* ArenaSim::spawnPaperAtRandomSpawn(const std::string& kind, double hp) {
  const auto& s = room_.spawns[static_cast<size_t>(rng_.uniform() * room_.spawns.size())];
  return spawnPaper(kind, s.first * kTile + 8 + rng_.between(-10, 10), s.second * kTile + 8 + rng_.between(-6, 6), hp, true);
}

void ArenaSim::nextWave() {
  waveIdx_++;
  if (waveIdx_ >= static_cast<int>(stage_.waves.size())) { onCleared(); return; }
  queue_ = stage_.waves[static_cast<size_t>(waveIdx_)];
  for (size_t i = queue_.size(); i > 1; i--) std::swap(queue_[i - 1], queue_[static_cast<size_t>(rng_.uniform() * i)]);
  spawnCd_ = 0;
  sfx("ding");
  toast("ui.wave", ToneAccent, waveIdx_ + 1, static_cast<double>(stage_.waves.size()));
}

void ArenaSim::spawnBoss(const std::string& kind) {
  boss_ = Boss{};
  boss_.alive = true;
  boss_.kind = kind;
  boss_.hp = boss_.maxHp = stage_.hpBudget;
  boss_.x = bounds_.x + bounds_.w / 2;
  boss_.y = bounds_.y + 46;
  boss_.r = kind == "final_exam" ? 26 : 19;
  boss_.timer = 1.6;
  boss_.tx = boss_.sx = boss_.x;
  boss_.ty = boss_.sy = boss_.y;
  boss_.summonTimer = B_["bosses"]["final_exam"]["timing"]["summonEvery"].num(8);
  emit(Ev::BossSpawn, kind, boss_.x, boss_.y);
  sfx("boss");
}

// ---------------------------------------------------------------- combat

bool ArenaSim::aimPoint(const ArenaInput& in, double& ax, double& ay) const {
  if (!in.autoAim) {
    if (!in.hasAim) return false;
    ax = in.aimX;
    ay = in.aimY;
    return true;
  }
  bool found = false;
  double bd = A_["autoAimRange"].num(260);
  for (const Paper& p : papers_) {
    if (!p.active || p.spawnT > 0) continue;
    const double d = std::hypot(p.x - pl_.cx(), p.y - pl_.cy());
    if (d < bd) { bd = d; ax = p.x; ay = p.y; found = true; }
  }
  if (boss_.alive && boss_.state != "warn") {
    const double d = std::hypot(boss_.x - pl_.cx(), boss_.y - pl_.cy());
    if (d < bd + 60) { ax = boss_.x; ay = boss_.y; found = true; }
  }
  return found;
}

void ArenaSim::fire(double dt, const ArenaInput& in) {
  const Json& semi = B_["ammo"]["semicolon"];
  fireCd_ = std::max(0.0, fireCd_ - dt);
  if (reload_ > 0) {
    reload_ -= dt;
    if (reload_ <= 0) { clip_ = clipMax_; sfx("pickup", 0.7); }
    return;
  }
  double tx = 0, ty = 0;
  const bool target = aimPoint(in, tx, ty);
  const bool wants = in.autoAim ? target : in.fireHeld;
  if (!wants || !target || fireCd_ > 0) return;
  if (clip_ <= 0) {
    if (now_ - lastEmpty_ > 0.9) {
      floatText(pl_.x, pl_.y - 26, "@ui.emptyClip", ToneRed);
      lastEmpty_ = now_;
      sfx("empty");
    }
    reload_ = reloadTime_;
    sfx("reload");
    return;
  }
  auto it = std::find_if(shots_.begin(), shots_.end(), [](const Shot& s) { return !s.active; });
  if (it == shots_.end()) return;
  const double ang = std::atan2(ty - pl_.cy(), tx - pl_.cx());
  const double speed = semi["projectileSpeed"].num(260);
  *it = Shot{true, 0, pl_.cx(), pl_.cy(), std::cos(ang) * speed, std::sin(ang) * speed, 1.6, semi["damage"].num(10)};
  pl_.facing = std::cos(ang) >= 0 ? 1 : -1;
  fireCd_ = 1 / semi["shotsPerSecond"].num(6);
  clip_--;
  sfx("shoot", 0.9 + rng_.uniform() * 0.2);
  if (clip_ == 0) { reload_ = reloadTime_; sfx("reload"); }
}

void ArenaSim::throwCoffee(const ArenaInput& in) {
  const bool useNes = ammoNes_ > 0 && (boss_.alive || ammoMac_ <= 0);
  int kind = useNes ? 1 : ammoMac_ > 0 ? 0 : -1;
  if (kind < 0) { floatText(pl_.x, pl_.y - 26, "☕ 0", ToneRed); sfx("empty"); return; }
  double tx = 0, ty = 0;
  if (!aimPoint(in, tx, ty)) { tx = pl_.x + pl_.facing * 60; ty = pl_.cy(); }
  const double range = A_["coffeeThrowRange"].num(140);
  const double dx = tx - pl_.cx(), dy = ty - pl_.cy(), d = std::hypot(dx, dy);
  if (d > range) { tx = pl_.cx() + dx / d * range; ty = pl_.cy() + dy / d * range; }
  (kind == 1 ? ammoNes_ : ammoMac_)--;
  cups_.push_back({kind, pl_.cx(), pl_.cy(), tx, ty, 0});
  sfx("throw");
}

void ArenaSim::splash(const Cup& c) {
  const Json& ammo = B_["ammo"][c.kind == 1 ? "nescafe" : "maccoffee"];
  const double R = ammo["splashRadius"].num() * splashMult_;
  emit(Ev::Splash, c.kind == 1 ? "nescafe" : "maccoffee", c.tx, c.ty, R);
  sfx("splash");
  for (Paper& p : papers_) {
    if (!p.active) continue;
    if (std::hypot(p.x - c.tx, p.y - c.ty) <= R + p.r) {
      p.soggy = ammo["soggy"]["seconds"].num();
      p.soggyMult = ammo["soggy"]["speedMultiplier"].num(1);
      damagePaper(p, ammo["damage"].num());
    }
  }
  if (boss_.alive && std::hypot(boss_.x - c.tx, boss_.y - c.ty) <= R + boss_.r) {
    boss_.soggy = ammo["soggy"]["seconds"].num();
    boss_.soggyMult = ammo["soggy"]["speedMultiplier"].num(1);
    damageBoss(ammo["damage"].num());
  }
  emit(Ev::Shake, "", 0, 0, 80, 0.003);
}

void ArenaSim::damagePaper(Paper& p, double dmg) {
  if (!p.active || p.spawnT > 0) return;
  const double real = std::min(dmg, p.hp);
  p.hp -= dmg;
  p.flash = 0.06;
  if (p.primary) destroyed_ += real;
  floatText(p.x, p.y - p.r * 1.3, "-" + std::to_string(static_cast<int>(dmg)), ToneText, 6);
  if (p.hp > 0) { sfx("hit"); return; }
  emit(Ev::Shred, "", p.x, p.y, p.maxHp >= 100 ? 16 : 7);
  sfx("tear", 0.8 + rng_.uniform() * 0.4);
  const EnemyDef& d = data_.enemies()[static_cast<size_t>(p.kind)];
  const double x = p.x, y = p.y;
  p.active = false;
  for (int i = 0; i < d.onDeathCount; i++) {
    const double a = static_cast<double>(i) / d.onDeathCount * kPi * 2;
    spawnPaper(d.onDeathSpawn, x + std::cos(a) * 10, y + std::sin(a) * 10, 0, false);
  }
  if (rng_.uniform() < A_["dropChance"].num()) addPickup("maccoffee", x, y);
}

void ArenaSim::damageBoss(double dmg) {
  if (!boss_.alive || boss_.hp <= 0) return;
  const double real = std::min(dmg, boss_.hp);
  boss_.hp -= dmg;
  destroyed_ += real;
  boss_.flash = 0.06;
  floatText(boss_.x + rng_.between(-10, 10), boss_.y - boss_.r, "-" + std::to_string(static_cast<int>(dmg)), ToneAccent, 7);
  sfx("hit", 0.7);
  if (boss_.kind == "final_exam") {
    const Json& tm = B_["bosses"]["final_exam"]["timing"];
    const double f = boss_.hp / boss_.maxHp;
    if (boss_.phase == 1 && f < tm["phase2"].num(0.6)) {
      boss_.phase = 2;
      toast("ui.extraSheets", ToneRed);
      emit(Ev::Shake, "", 0, 0, 200, 0.006);
      emit(Ev::BossPhase, "", 0, 0, 2);
    }
    if (boss_.phase == 2 && f < tm["phase3"].num(0.3)) {
      boss_.phase = 3;
      emit(Ev::Shake, "", 0, 0, 250, 0.008);
      sfx("boss", 1.3);
      emit(Ev::BossPhase, "", 0, 0, 3);
    }
  }
  if (boss_.hp <= 0) {
    emit(Ev::Shred, "", boss_.x, boss_.y, 60);
    emit(Ev::Shake, "", 0, 0, 400, 0.012);
    sfx("tear", 0.5);
    boss_.alive = false;
    emit(Ev::BossDead);
    onCleared();
  }
}

void ArenaSim::damagePlayer(double n, bool ignoreInvuln) {
  if (ended_ || invulnerable) return;
  if (!ignoreInvuln && pl_.invuln > 0) return;
  const double hitInv = B_["player"]["hitInvulnerable"].num(0.6);
  if (shield_ > 0 && !ignoreInvuln) {
    shield_--;
    pl_.invuln = hitInv;
    floatText(pl_.x, pl_.y - 28, "@ui.blocked", ToneCyan);
    return;
  }
  sanity_ = std::max(0.0, sanity_ - n);
  if (!ignoreInvuln) {
    pl_.invuln = hitInv;
    emit(Ev::Shake, "", 0, 0, 120, 0.006);
    sfx("hurt");
    floatText(pl_.x, pl_.y - 26, "\xE2\x88\x92" + std::to_string(static_cast<int>(n)) + "%", ToneRed, 8);
    if (rng_.uniform() < 0.25) emit(Ev::Bark, "bark");
  }
  if (sanity_ <= 0) onFailed();
}

void ArenaSim::enemyShot(double x, double y, double ang, double speed, double dmg, int tex) {
  auto it = std::find_if(eshots_.begin(), eshots_.end(), [](const Shot& s) { return !s.active; });
  if (it == eshots_.end()) return;
  *it = Shot{true, tex, x, y, std::cos(ang) * speed, std::sin(ang) * speed, 6, dmg};
}

bool ArenaSim::inDesk(double x, double y) const {
  for (const Rect& d : desks_) if (x >= d.x && x <= d.x + d.w && y >= d.y - 4 && y <= d.y + d.h) return true;
  return false;
}

bool ArenaSim::outside(double x, double y) const {
  const Rect& b = bounds_;
  return x < b.x - 4 || y < b.y - 12 || x > b.x + b.w + 4 || y > b.y + b.h + 4;
}

// ---------------------------------------------------------------- assist, end of stage

void ArenaSim::callProfessor() {
  if (assistUsed_ || ended_) return;
  assistUsed_ = true;
  if (prof_.assistId == "time_dilation") frozen_ = std::max(frozen_, prof_.assistSeconds > 0 ? prof_.assistSeconds : 8);
  else if (prof_.assistId == "stress_detected") {
    const double heal = prof_.assistHeals > 0 ? prof_.assistHeals : 40;
    sanity_ = std::min(sanityMax_, sanity_ + heal);
    floatText(pl_.x, pl_.y - 28, "+" + std::to_string(static_cast<int>(heal)), ToneGreen, 8);
  } else if (prof_.assistId == "isometry") isometry_ = prof_.assistSeconds > 0 ? prof_.assistSeconds : 5;
  sfx("ding", 0.8);
  emit(Ev::Bark, "assist");
  emit(Ev::CameraFlash);
}

void ArenaSim::onCleared() {
  if (cleared_ || ended_) return;
  cleared_ = true;
  sfx("win");
  toast("ui.stageCleared", ToneGreen);
  // The submission portal; at "23:58" the portal is down (503) for a few seconds.
  hasExit_ = true;
  // From the room data, so it is reachable and away from the top edge (browser bars on phones).
  exitX_ = (room_.exitX >= 0 ? room_.exitX : room_.startX) * kTile + 8;
  exitY_ = (room_.exitY >= 0 ? room_.exitY : room_.startY) * kTile + 8;
  const bool down = deadline_ > 0 && deadline_ < A_["portalDownBelowSeconds"].num(3);
  exitLockedUntil_ = down ? now_ + B_["hazards"]["portal_down"]["exitLockedSeconds"].num(5) : 0;
  portalWasDown_ = down;
  emit(Ev::Cleared, "", exitX_, exitY_, down ? 1 : 0);
  if (down) toast("ui.portalDown", ToneRed);
  for (Paper& p : papers_) p.active = false;
  for (Shot& s : eshots_) s.active = false;
  if (autoSubmit) submitAt_ = now_ + 0.3;
}

void ArenaSim::submit() {
  if (ended_ || !cleared_) return;
  const bool onTime = deadline_ > 0;
  int score = clearedScore(data_, sanity_, sanityMax_, onTime);
  if (attendanceMissed_) score -= B_["hazards"]["attendance_sheet"]["penaltyIfMissed"].integer(5);
  finish(true, std::max(0, score), !onTime, false);
}

void ArenaSim::onFailed() {
  if (ended_) return;
  const bool mercy = hasMercyPass(data_, course_.id);
  const int score = mercy ? B_["scoring"]["mercyPassScore"].integer(70) : failedScore(destroyed_ / total_);
  sfx("buzz");
  emit(Ev::Shake, "", 0, 0, 300, 0.01);
  finish(false, score, false, mercy);
}

void ArenaSim::finish(bool cleared, int score, bool late, bool mercy) {
  ended_ = true;
  result_ = StageResult{};
  result_.cleared = cleared;
  result_.score = score;
  result_.late = late;
  result_.mercy = mercy;
  result_.retake = !cleared && !mercy;
  result_.sanityLeft = static_cast<int>(jsRound(sanity_));
  result_.attendanceMissed = attendanceMissed_;
  result_.destroyedFraction = destroyed_ / total_;
  // Q.E.D.: finish Prof. Bezout's final with full Sanity.
  if (cleared && stage_.boss == "final_exam" && sanity_ >= sanityMax_ && prof_.achievementId == "qed") result_.achievement = "qed";
  emit(Ev::Ended);
}

// ---------------------------------------------------------------- main loop

void ArenaSim::step(double dt, const ArenaInput& in) {
  if (ended_) return;
  elapsed_ += dt;
  now_ += dt;

  movePlayer(dt, in);
  if (in.help) callProfessor();
  if (in.coffee) throwCoffee(in);
  if (in.reload && reload_ <= 0 && clip_ < clipMax_) { reload_ = reloadTime_; sfx("reload"); }
  fire(dt, in);

  // Deadline and the 23:59 wall.
  if (frozen_ > 0) frozen_ -= dt;
  else if (!cleared_) deadline_ -= dt;
  if (deadline_ <= 0 && !late_) { late_ = true; sfx("buzz"); toast("ui.lateSubmission", ToneRed); emit(Ev::Late); }
  updateWall(dt);

  // Waves.
  if (stage_.boss.empty() && !cleared_) {
    if (!queue_.empty()) {
      spawnCd_ -= dt;
      if (spawnCd_ <= 0) {
        const Spawn s = queue_.front();
        queue_.erase(queue_.begin());
        spawnPaperAtRandomSpawn(s.type, s.hp);
        spawnCd_ = A_["spawnStaggerSeconds"].num(0.25);
      }
    } else if (std::none_of(papers_.begin(), papers_.end(), [](const Paper& p) { return p.active; })) {
      wavePause_ -= dt;
      if (wavePause_ <= 0) { wavePause_ = A_["wavePauseSeconds"].num(1.2); nextWave(); }
    }
  }

  updatePapers(dt);
  updateBoss(dt);
  updateShots(dt);
  updateCups(dt);
  updatePickups();
  updateAttendance(dt);
  if (isometry_ > 0) isometry_ -= dt;

  // Mid-fight barks.
  barkCd_ -= dt;
  if (barkCd_ <= 0) {
    emit(Ev::Bark, rng_.uniform() < 0.6 ? "bark" : "tip");
    barkCd_ = rng_.between(A_["barkEverySeconds"][0].integer(14), A_["barkEverySeconds"][1].integer(22));
  }

  if (hasExit_) {
    if (portalWasDown_ && now_ >= exitLockedUntil_) { portalWasDown_ = false; emit(Ev::PortalUp); }
    if (std::hypot(pl_.x - exitX_, pl_.y - 10 - exitY_) < 20 && now_ >= exitLockedUntil_) submit();
    if (submitAt_ >= 0 && now_ >= submitAt_) submit();
  }
}

void ArenaSim::updateWall(double dt) {
  const Rect& b = bounds_;
  const double frac = std::max(0.0, deadline_) / stage_.deadline;
  const double startsAt = A_["wallStartsAt"].num(0.25);
  double reach = -0.05;
  if (frac < startsAt) reach = A_["wallReachAtDeadline"].num(0.35) * (1 - frac / startsAt);
  double target = b.x + b.w * reach;
  if (deadline_ <= 0) target = std::min(b.x + b.w * A_["wallMaxReach"].num(0.55), wallX_ + A_["wallLateSpeed"].num(6) * dt);
  if (frozen_ > 0 || cleared_) target = wallX_;
  wallX_ = deadline_ <= 0 ? target : lerp(wallX_, target, 0.1);
  if (wallX_ > b.x - 10 && pl_.x < wallX_) {
    wallTick_ += dt;
    if (wallTick_ >= 0.2) {
      damagePlayer(jsRound(B_["hazards"]["deadline_wall"]["touchDamagePerSecond"].num(25) * wallTick_), true);
      wallTick_ = 0;
      emit(Ev::Shake, "", 0, 0, 50, 0.003);
    }
    pl_.x += 40 * dt;  // the wall shoves the student along
  }
}

void ArenaSim::updatePapers(double dt) {
  const double px = pl_.cx(), py = pl_.cy();
  const Rect& b = bounds_;
  for (Paper& p : papers_) {
    if (!p.active) continue;
    if (p.spawnT > 0) { p.spawnT -= dt; continue; }
    if (p.soggy > 0) { p.soggy -= dt; if (p.soggy <= 0) p.soggyMult = 1; }
    if (p.flash > 0) p.flash -= dt;
    const EnemyDef& d = data_.enemies()[static_cast<size_t>(p.kind)];
    const double dx = px - p.x, dy = py - p.y;
    double dist = std::hypot(dx, dy);
    if (dist == 0) dist = 1;
    const double sp = d.speed * p.soggyMult;
    double ang = std::atan2(dy, dx);
    if (d.behaviour == "swarm_chase") ang += std::sin(elapsed_ * 3 + p.jitter) * 0.7;
    double vx = std::cos(ang) * sp, vy = std::sin(ang) * sp;
    // Separation so swarms spread out.
    for (const Paper& q : papers_) {
      if (&q == &p || !q.active) continue;
      const double sx = p.x - q.x, sy = p.y - q.y, sd = sx * sx + sy * sy, mn = p.r + q.r;
      if (sd < mn * mn && sd > 0.01) {
        const double k = (mn - std::sqrt(sd)) * 6;
        vx += sx * k / mn;
        vy += sy * k / mn;
      }
    }
    if (isometry_ > 0) {
      // Prof. Bezout's Isometry: no paper may come any closer.
      const double ux = dx / dist, uy = dy / dist, toward = vx * ux + vy * uy;
      if (toward > 0) { vx -= toward * ux; vy -= toward * uy; }
    }
    p.x = clamp(p.x + vx * dt, b.x + 4, b.x + b.w - 4);
    p.y = clamp(p.y + vy * dt, b.y - 6, b.y + b.h - 4);
    p.angle = std::sin(elapsed_ * 6 + p.jitter) * 8;
    if (d.behaviour == "chase_and_shoot" && d.shoots) {
      p.shotTimer -= dt;
      if (p.shotTimer <= 0 && dist < 220) { p.shotTimer = d.shotEvery; enemyShot(p.x, p.y, std::atan2(dy, dx), d.shotSpeed, d.shotDamage, TexStaple); }
    }
    if (dist < p.r + 5) {
      damagePlayer(d.touchDamage);
      // Bounce off the student so paper never parks on top of them.
      const double push = std::min(22.0, 120 / std::max(6.0, p.r));
      p.x = clamp(p.x - dx / dist * push, b.x + 4, b.x + b.w - 4);
      p.y = clamp(p.y - dy / dist * push, b.y - 6, b.y + b.h - 4);
    }
  }
}

void ArenaSim::updateBoss(double dt) {
  Boss& b = boss_;
  if (!b.alive) return;
  if (b.soggy > 0) { b.soggy -= dt; if (b.soggy <= 0) b.soggyMult = 1; }
  if (b.flash > 0) b.flash -= dt;
  const double slow = b.soggyMult;
  b.timer -= dt * slow;
  const Rect& bd = bounds_;
  if (b.kind == "midterm_paper") {
    const Json& boss = B_["bosses"]["midterm_paper"];
    const Json& tm = boss["timing"];
    if (b.state == "idle") {
      b.x += std::cos(elapsed_ * 0.9) * 18 * dt;
      b.y += std::sin(elapsed_ * 1.3) * 10 * dt;
      if (b.timer <= 0) {
        // Fold into a plane; the shadow shows where it will land.
        b.state = "warn";
        b.timer = tm["warn"].num(1);
        b.tx = pl_.x;
        b.ty = pl_.y - 8;
        emit(Ev::BossTexture, "plane");
        emit(Ev::BossWarn, "", b.tx, b.ty + 8);
        sfx("dive");
      }
    } else if (b.state == "warn") {
      if (b.timer <= 0) { b.state = "dive"; b.timer = tm["dive"].num(0.45); b.sx = b.x; b.sy = b.y; }
    } else if (b.state == "dive") {
      const double k = 1 - std::max(0.0, b.timer) / tm["dive"].num(0.45);
      b.x = lerp(b.sx, b.tx, k);
      b.y = lerp(b.sy, b.ty, k);
      if (b.timer <= 0) {
        b.state = "idle";
        b.timer = tm["idle"].num(1.4);
        emit(Ev::BossTexture, "paper");
        emit(Ev::Shake, "", 0, 0, 160, 0.008);
        if (std::hypot(pl_.cx() - b.x, pl_.cy() - b.y) < 26) damagePlayer(boss["touchDamage"].num());
        // A ring of A / B / C / D answer bubbles.
        const int n = tm["ringBubbles"].integer(8);
        for (int i = 0; i < n; i++) {
          const double a = static_cast<double>(i) / n * kPi * 2 + rng_.uniform() * 0.3;
          enemyShot(b.x, b.y, a, boss["bubble"]["speed"].num(), boss["bubble"]["damage"].num(), TexBubbleA + i % 4);
        }
      }
    }
  } else {
    const Json& boss = B_["bosses"]["final_exam"];
    const Json& tm = boss["timing"];
    const double fast = b.phase == 3 ? tm["phase3SpeedUp"].num(1.4) : 1;
    b.fireTimer -= dt * slow;
    if (b.fireTimer <= 0) {
      // Red-pen spiral.
      b.fireTimer = tm["spiralEvery"].num(0.14) / fast;
      const int arms = tm["arms"].integer(2);
      for (int k = 0; k < arms; k++)
        enemyShot(b.x, b.y + 4, b.angle + static_cast<double>(k) / arms * kPi * 2, boss["redPenMark"]["speed"].num() * fast, boss["redPenMark"]["damage"].num(), TexRedPen);
      b.angle += tm["spiralStep"].num(0.42);
    }
    if (b.phase >= 2) {
      b.summonTimer -= dt;
      if (b.summonTimer <= 0) {
        // "Additional answer sheets".
        b.summonTimer = tm["summonEvery"].num(8);
        for (int i = 0; i < tm["summonCount"].integer(4); i++) spawnPaper("loose_page", b.x + rng_.between(-30, 30), b.y + rng_.between(10, 30), 0, false);
        toast("ui.extraSheets", ToneRed);
        sfx("ding", 0.7);
      }
    }
    if (b.phase == 3) {
      const double dx = pl_.cx() - b.x, dy = pl_.cy() - b.y;
      double d = std::hypot(dx, dy);
      if (d == 0) d = 1;
      b.x += dx / d * tm["driftSpeed"].num(14) * slow * dt;
      b.y += dy / d * tm["driftSpeed"].num(14) * slow * dt;
    } else {
      b.x += std::cos(elapsed_ * 0.6) * 12 * dt;
    }
    if (std::hypot(pl_.cx() - b.x, pl_.cy() - b.y) < b.r + 6) damagePlayer(boss["touchDamage"].num());
  }
  b.x = clamp(b.x, bd.x + 20, bd.x + bd.w - 20);
  b.y = clamp(b.y, bd.y + 10, bd.y + bd.h - 20);
}

void ArenaSim::updateShots(double dt) {
  for (Shot& s : shots_) {
    if (!s.active) continue;
    s.life -= dt;
    const double ox = s.x, oy = s.y;
    const double x = ox + s.vx * dt, y = oy + s.vy * dt;
    s.x = x;
    s.y = y;
    // Bosses tower over the desks: in boss stages semicolons fly over them (desks still shield the player).
    if (s.life <= 0 || outside(x, y) || (!boss_.alive && inDesk(x, y))) { s.active = false; continue; }
    // Swept test along this frame's path, so papers right on top of the player still get hit.
    const double sx = x - ox, sy = y - oy;
    double len2 = sx * sx + sy * sy;
    if (len2 == 0) len2 = 1;
    auto segDist = [&](double cx, double cy) {
      const double k = clamp(((cx - ox) * sx + (cy - oy) * sy) / len2, 0, 1);
      return std::hypot(ox + sx * k - cx, oy + sy * k - cy);
    };
    bool hit = false;
    for (Paper& p : papers_) {
      if (!p.active || p.spawnT > 0) continue;
      if (segDist(p.x, p.y) < p.r + 3) { damagePaper(p, s.dmg); hit = true; break; }
    }
    if (!hit && boss_.alive && boss_.state != "warn" && boss_.state != "dive" && segDist(boss_.x, boss_.y) < boss_.r + 3) { damageBoss(s.dmg); hit = true; }
    if (hit) s.active = false;
  }
  for (Shot& s : eshots_) {
    if (!s.active) continue;
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // Shots launched from above a desk (boss) get a moment to clear it before desks count as cover.
    if (s.life <= 0 || outside(s.x, s.y) || (s.life < 5.7 && inDesk(s.x, s.y))) { s.active = false; continue; }
    if (std::fabs(pl_.cx() - s.x) < 6 && std::fabs(pl_.cy() - s.y) < 9 && (pl_.invuln <= 0 || shield_ > 0)) {
      damagePlayer(s.dmg);
      s.active = false;
    }
  }
}

void ArenaSim::updateCups(double dt) {
  const double fl = A_["coffeeFlightSeconds"].num(0.45);
  std::vector<Cup> landed;
  for (Cup& c : cups_) c.t += dt;
  auto it = std::remove_if(cups_.begin(), cups_.end(), [&](const Cup& c) {
    if (c.t < fl) return false;
    landed.push_back(c);
    return true;
  });
  cups_.erase(it, cups_.end());
  for (const Cup& c : landed) splash(c);
}

void ArenaSim::updatePickups() {
  for (size_t i = 0; i < pickups_.size(); i++) {
    Pickup& p = pickups_[i];
    if (!p.active || std::hypot(p.x - pl_.x, p.y - (pl_.y - 8)) > 14) continue;
    if (p.type == "maccoffee" || p.type == "nescafe") {
      int& count = p.type == "maccoffee" ? ammoMac_ : ammoNes_;
      const int max = B_["ammo"][p.type]["maxCarry"].integer(6);
      if (count >= max) continue;
      count = std::min(max, count + 1);
      firstCoffeeTaken_ = true;
      eightAm_ = false;
      sfx("sachet");
      floatText(p.x, p.y - 8, "@ui.pickupCoffee|" + p.type, ToneAccent);
    } else if (p.type == "canteen_food") {
      if (sanity_ >= sanityMax_) continue;
      const double heal = B_["pickups"]["canteen_food"]["heals"].num(35);
      sanity_ = std::min(sanityMax_, sanity_ + heal);
      sfx("pickup");
      floatText(p.x, p.y - 8, "@ui.pickupFood", ToneGreen, 0, heal);
    } else if (p.type == "deadline_extension") {
      frozen_ = std::max(frozen_, B_["pickups"]["deadline_extension"]["freezeSeconds"].num(10));
      sfx("pickup", 1.3);
      floatText(p.x, p.y - 8, "@ui.pickupExtension", ToneCyan);
    } else if (p.type == "feynman_lectures") {
      shield_ += B_["pickups"]["feynman_lectures"]["blocksHits"].integer(1);
      sfx("pickup", 0.8);
      floatText(p.x, p.y - 8, "@ui.feynman", ToneRed);
    }
    p.active = false;
    emit(Ev::PickupTaken, p.type, p.x, p.y, static_cast<double>(i));
  }
}

void ArenaSim::updateAttendance(double dt) {
  const Json& h = B_["hazards"]["attendance_sheet"];
  const double onScreen = h["secondsOnScreen"].num(12);
  if (attendanceAt_ > 0 && stage_.deadline - deadline_ >= attendanceAt_ && !attActive_ && !cleared_) {
    attendanceAt_ = -1;
    attActive_ = true;
    attX_ = bounds_.x + 20;
    attY_ = bounds_.y + 30 + rng_.uniform() * (bounds_.h - 60);
    attT_ = onScreen;
    attVx_ = (bounds_.w - 40) / onScreen;
    emit(Ev::AttendanceSpawn, "", attX_, attY_);
    toast("ui.attendance", ToneAccent);
    sfx("ding", 1.2);
  }
  if (!attActive_) return;
  attT_ -= dt;
  attX_ += attVx_ * dt;
  attY_ += std::sin(elapsed_ * 2) * 12 * dt;
  if (std::hypot(attX_ - pl_.x, attY_ - (pl_.y - 10)) < 14) {
    sfx("pickup", 1.5);
    floatText(attX_, attY_ - 8, "\xE2\x9C\x93", ToneGreen, 10);
    attActive_ = false;
    emit(Ev::AttendanceTaken);
  } else if (attT_ <= 0) {
    attendanceMissed_ = true;
    toast("ui.missedAttendance", ToneRed);
    attActive_ = false;
    emit(Ev::AttendanceMissed);
  }
}

// ---------------------------------------------------------------- debug helpers (tests)

void ArenaSim::debugSpawn(const std::string& kind, int n) {
  for (int i = 0; i < n; i++) spawnPaperAtRandomSpawn(kind, 0);
}

void ArenaSim::debugKillAll() {
  for (int pass = 0; pass < 2; pass++)
    for (Paper& p : papers_) if (p.active) { p.spawnT = 0; damagePaper(p, 99999); }
  for (const Spawn& s : queue_) destroyed_ += s.hp;
  queue_.clear();
  if (stage_.boss.empty()) {
    for (int i = waveIdx_ + 1; i < static_cast<int>(stage_.waves.size()); i++)
      for (const Spawn& s : stage_.waves[static_cast<size_t>(i)]) destroyed_ += s.hp;
    waveIdx_ = static_cast<int>(stage_.waves.size()) - 1;
    onCleared();
  }
  if (boss_.alive) damageBoss(boss_.hp);
}

void ArenaSim::debugDamagePlayer(double n) {
  const bool inv = invulnerable;
  invulnerable = false;
  pl_.invuln = 0;
  damagePlayer(n);
  invulnerable = inv;
}

}  // namespace cau
