// The arena fight: one stage of a course, simulated without any graphics.
//
// The browser (Phaser) feeds input in with step(), reads positions back out, and turns the
// events this produces into sound, particles and text. Native tests drive the same class
// with a scripted player, so the whole fight logic is testable without a browser.
#pragma once
#include <string>
#include <vector>

#include "data.hpp"
#include "rng.hpp"
#include "rules.hpp"

namespace cau {

enum class Ev {
  Sfx,            // key = sound id, a = pitch
  Float,          // floating text at (x, y). key = literal text, or "@<text key>[|param]" to translate; a = font size (0 = default), b = {n}; tone
  Shake,          // a = duration ms, b = intensity
  CameraFlash,
  Toast,          // key = text key; a, b = {n}, {total}; tone
  Bark,           // key = line kind: "bark", "tip", "assist"
  Shred,          // paper shreds at (x, y), a = count
  Splash,         // coffee splash at (x, y), a = radius
  PickupSpawn,    // a = pickup index, key = type, at (x, y)
  PickupTaken,    // a = pickup index
  Teammates,      // a = count, at (x, y) = first teammate's feet
  BossSpawn,      // key = boss kind
  BossTexture,    // key = "plane" or "paper"
  BossWarn,       // dive target shadow at (x, y)
  BossPhase,      // a = phase
  BossDead,
  Cleared,        // a = 1 if the submit portal is down (503)
  PortalUp,
  AttendanceSpawn,
  AttendanceTaken,
  AttendanceMissed,
  Late,
  Ended,
};

enum Tone { ToneText = 0, ToneAccent, ToneRed, ToneGreen, ToneCyan, ToneDim };

struct Event {
  Ev type;
  std::string key;
  double x = 0, y = 0, a = 0, b = 0;
  int tone = ToneText;
};

struct ArenaConfig {
  std::string courseId;
  int stageIndex = 0;
  std::vector<std::string> upgrades;
  bool firstCoffee = true;
  bool lunch = false;
  int maccoffee = 3, nescafe = 0;
  uint32_t seed = 1;
};

struct ArenaInput {
  double moveX = 0, moveY = 0;  // length <= 1
  bool fireHeld = false;         // mouse button (desktop)
  bool hasAim = false;           // desktop: aim at (aimX, aimY)
  double aimX = 0, aimY = 0;
  bool autoAim = false;          // touch: aim and fire at the nearest paper
  bool coffee = false, dash = false, help = false, reload = false;
};

struct StageResult {
  bool cleared = false, late = false, mercy = false, retake = false, attendanceMissed = false;
  int score = 0, sanityLeft = 0;
  double destroyedFraction = 0;
  std::string achievement;
};

struct Paper {
  bool active = false, primary = true;
  int kind = 0;
  double x = 0, y = 0, hp = 0, maxHp = 0, r = 6;
  double soggy = 0, soggyMult = 1, shotTimer = 0, jitter = 0, flash = 0, spawnT = 0, angle = 0;
};

struct Shot { bool active = false; int tex = 0; double x = 0, y = 0, vx = 0, vy = 0, life = 0, dmg = 0; };
struct Cup { int kind = 0; double sx = 0, sy = 0, tx = 0, ty = 0, t = 0; };
struct Pickup { bool active = false; std::string type; double x = 0, y = 0; };

struct Boss {
  bool alive = false;
  std::string kind;
  double hp = 0, maxHp = 0, x = 0, y = 0, r = 19;
  std::string state = "idle";
  double timer = 0, tx = 0, ty = 0, sx = 0, sy = 0, angle = 0, fireTimer = 0, summonTimer = 0;
  int phase = 1;
  double flash = 0, soggy = 0, soggyMult = 1;
};

struct PlayerState {
  double x = 0, y = 0, vx = 0, vy = 0;
  double dashTimer = 0, dashCooldown = 0, invuln = 0;
  double dashX = 0, dashY = 1;
  int facing = 1;
  double cx() const { return x; }
  double cy() const { return y - 11; }
};

// Enemy-shot textures, in the order the browser maps them.
enum ShotTex { TexStaple = 0, TexRedPen, TexBubbleA, TexBubbleB, TexBubbleC, TexBubbleD };

class ArenaSim {
 public:
  ArenaSim(const GameData& data, const ArenaConfig& cfg);

  void step(double dt, const ArenaInput& in);
  std::vector<Event> takeEvents();

  // Sprite sizes come from the art (browser side); papers use them for their hit radius.
  void setSpriteSize(const std::string& kind, double w, double h);

  // Debug / test flags.
  bool invulnerable = false;
  bool autoSubmit = false;
  void debugSpawn(const std::string& kind, int n);
  void debugKillAll();
  void debugDamagePlayer(double n);
  void debugSetClip(int n) { clip_ = n; reload_ = 0; }
  void debugSetSanity(double v) { sanity_ = v; }
  void debugTeleport(double x, double y) { pl_.x = x; pl_.y = y; }
  void submit();

  // State for rendering.
  const Stage& stage() const { return stage_; }
  const PlayerState& player() const { return pl_; }
  const std::vector<Paper>& papers() const { return papers_; }
  const std::vector<Shot>& shots() const { return shots_; }
  const std::vector<Shot>& enemyShots() const { return eshots_; }
  const std::vector<Cup>& cups() const { return cups_; }
  const std::vector<Pickup>& pickups() const { return pickups_; }
  const Boss& boss() const { return boss_; }
  const Rect& bounds() const { return bounds_; }
  const std::vector<Rect>& desks() const { return desks_; }

  double sanity() const { return sanity_; }
  double sanityMax() const { return sanityMax_; }
  int clip() const { return clip_; }
  int clipMax() const { return clipMax_; }
  bool reloading() const { return reload_ > 0; }
  double deadline() const { return deadline_; }
  bool frozen() const { return frozen_ > 0; }
  bool late() const { return late_; }
  double wallX() const { return wallX_; }
  bool assistUsed() const { return assistUsed_; }
  int shield() const { return shield_; }
  bool cleared() const { return cleared_; }
  bool ended() const { return ended_; }
  double elapsed() const { return elapsed_; }
  double destroyed() const { return destroyed_; }
  double totalHp() const { return total_; }
  int maccoffee() const { return ammoMac_; }
  int nescafe() const { return ammoNes_; }
  bool eightAm() const { return eightAm_; }
  bool firstCoffeeTaken() const { return firstCoffeeTaken_; }
  bool hasExit() const { return hasExit_; }
  double exitX() const { return exitX_; }
  double exitY() const { return exitY_; }
  bool exitLocked() const { return hasExit_ && now_ < exitLockedUntil_; }
  bool attendanceActive() const { return attActive_; }
  double attendanceX() const { return attX_; }
  double attendanceY() const { return attY_; }
  int activeEnemies() const;
  const StageResult& result() const { return result_; }
  const std::string& kindName(int k) const { return data_.enemies()[static_cast<size_t>(k)].id; }

 private:
  const GameData& data_;
  const Json& B_;
  const Json& A_;
  Course course_;
  Professor prof_;
  Room room_;
  Stage stage_;
  Rng rng_;
  std::vector<Event> events_;

  Rect bounds_;
  std::vector<Rect> desks_;  // pixels
  PlayerState pl_;
  std::vector<Paper> papers_;
  std::vector<Shot> shots_, eshots_;
  std::vector<Cup> cups_;
  std::vector<Pickup> pickups_;
  std::vector<double> spriteR_;
  Boss boss_;

  double sanity_ = 100, sanityMax_ = 100;
  int clip_ = 30, clipMax_ = 30;
  double reload_ = 0, reloadTime_ = 1, fireCd_ = 0, splashMult_ = 1;
  double deadline_ = 0, frozen_ = 0, wallX_ = 0, wallTick_ = 0, isometry_ = 0;
  bool assistUsed_ = false;
  int shield_ = 0;
  bool eightAm_ = false, firstCoffeeTaken_ = false;
  int ammoMac_ = 3, ammoNes_ = 0;
  int waveIdx_ = -1;
  std::vector<Spawn> queue_;
  double spawnCd_ = 0, wavePause_ = 0.8;
  double destroyed_ = 0, total_ = 1;
  bool cleared_ = false, ended_ = false, late_ = false;
  double barkCd_ = 8;
  bool teammatesShown_ = false;
  double attendanceAt_ = -1;
  bool attActive_ = false, attendanceMissed_ = false;
  double attX_ = 0, attY_ = 0, attT_ = 0, attVx_ = 0;
  double lastEmpty_ = -10;
  double elapsed_ = 0, now_ = 0;
  bool hasExit_ = false;
  double exitX_ = 0, exitY_ = 0, exitLockedUntil_ = 0;
  bool portalWasDown_ = false;
  double submitAt_ = -1;
  StageResult result_;

  void emit(Ev t, const std::string& key = "", double x = 0, double y = 0, double a = 0, double b = 0, int tone = ToneText);
  void sfx(const std::string& id, double pitch = 1) { emit(Ev::Sfx, id, 0, 0, pitch); }
  void toast(const std::string& key, int tone, double a = 0, double b = 0) { emit(Ev::Toast, key, 0, 0, a, b, tone); }
  void floatText(double x, double y, const std::string& text, int tone, double size = 0, double n = 0) { emit(Ev::Float, text, x, y, size, n, tone); }

  void movePlayer(double dt, const ArenaInput& in);
  bool overlapsDesk(double l, double t, double r, double b) const;
  void addPickup(const std::string& type, double x, double y);
  Paper* spawnPaper(const std::string& kind, double x, double y, double hp, bool primary);
  Paper* spawnPaperAtRandomSpawn(const std::string& kind, double hp);
  void nextWave();
  void spawnBoss(const std::string& kind);
  bool aimPoint(const ArenaInput& in, double& ax, double& ay) const;
  void fire(double dt, const ArenaInput& in);
  void throwCoffee(const ArenaInput& in);
  void splash(const Cup& c);
  void damagePaper(Paper& p, double dmg);
  void damageBoss(double dmg);
  void damagePlayer(double n, bool ignoreInvuln = false);
  void enemyShot(double x, double y, double ang, double speed, double dmg, int tex);
  bool inDesk(double x, double y) const;
  bool outside(double x, double y) const;
  void callProfessor();
  void onCleared();
  void onFailed();
  void finish(bool cleared, int score, bool late, bool mercy);
  void updateWall(double dt);
  void updatePapers(double dt);
  void updateBoss(double dt);
  void updateShots(double dt);
  void updateCups(double dt);
  void updatePickups();
  void updateAttendance(double dt);
};

}  // namespace cau
