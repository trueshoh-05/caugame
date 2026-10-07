// JavaScript bindings (Emscripten embind). Only compiled for the WebAssembly build.
//
//   const core = new Module.Core(enemiesJson, coursesJson, professorsJson, campusJson, roomsJsonArray);
//   const arena = new Module.Arena(core, { courseId, stageIndex, upgrades, ... });
//   arena.step(dt, input); for (const e of arena.events()) ...; arena.delete();
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <memory>

#include "arena.hpp"
#include "campus.hpp"
#include "rules.hpp"

using emscripten::val;
using namespace cau;

namespace {

const char* evName(Ev e) {
  switch (e) {
    case Ev::Sfx: return "sfx";
    case Ev::Float: return "float";
    case Ev::Shake: return "shake";
    case Ev::CameraFlash: return "flash";
    case Ev::Toast: return "toast";
    case Ev::Bark: return "bark";
    case Ev::Shred: return "shred";
    case Ev::Splash: return "splash";
    case Ev::PickupSpawn: return "pickupSpawn";
    case Ev::PickupTaken: return "pickupTaken";
    case Ev::Teammates: return "teammates";
    case Ev::BossSpawn: return "bossSpawn";
    case Ev::BossTexture: return "bossTexture";
    case Ev::BossWarn: return "bossWarn";
    case Ev::BossPhase: return "bossPhase";
    case Ev::BossDead: return "bossDead";
    case Ev::Cleared: return "cleared";
    case Ev::PortalUp: return "portalUp";
    case Ev::AttendanceSpawn: return "attendanceSpawn";
    case Ev::AttendanceTaken: return "attendanceTaken";
    case Ev::AttendanceMissed: return "attendanceMissed";
    case Ev::Late: return "late";
    case Ev::Ended: return "ended";
  }
  return "unknown";
}

std::vector<double> toDoubles(const val& arr) {
  std::vector<double> out;
  const unsigned n = arr["length"].as<unsigned>();
  for (unsigned i = 0; i < n; i++) out.push_back(arr[i].isNumber() ? arr[i].as<double>() : 0);
  return out;
}

val copyInts(const std::vector<int>& v) {
  return val::global("Int32Array").new_(emscripten::typed_memory_view(v.size(), v.data())).call<val>("slice");
}

bool flag(const val& o, const char* k) { return o[k].isTrue(); }
double number(const val& o, const char* k, double fallback = 0) { const val v = o[k]; return v.isNumber() ? v.as<double>() : fallback; }

}  // namespace

class Core {
 public:
  Core(const std::string& enemies, const std::string& courses, const std::string& professors, const std::string& campus, const std::string& rooms) {
    data.load(enemies, courses, professors, campus, rooms);
    map.load(data);
  }
  GameData data;
  CampusMap map;
  Rng rng{0xC0FFEEu};

  val stagePlan(const std::string& courseId) const {
    val out = val::array();
    const Course& c = data.course(courseId);
    for (size_t i = 0; i < c.components.size(); i++) out.call<void>("push", stage(courseId, static_cast<int>(i)));
    return out;
  }

  val stage(const std::string& courseId, int index) const {
    const Stage s = buildStage(data, courseId, index);
    val o = val::object();
    o.set("courseId", s.courseId);
    o.set("index", s.index);
    o.set("type", s.type);
    o.set("weight", s.weight);
    o.set("hpBudget", s.hpBudget);
    o.set("deadline", s.deadline);
    o.set("total", stageTotalHp(s));
    o.set("boss", s.boss.empty() ? val::null() : val(s.boss));
    val waves = val::array();
    for (const auto& w : s.waves) {
      val wave = val::array();
      for (const auto& sp : w) {
        val spawn = val::object();
        spawn.set("type", sp.type);
        spawn.set("hp", sp.hp);
        wave.call<void>("push", spawn);
      }
      waves.call<void>("push", wave);
    }
    o.set("waves", waves);
    return o;
  }

  val letter(double percent) const {
    const Letter l = letterFor(data, percent);
    val o = val::object();
    o.set("letter", l.letter);
    o.set("points", l.points);
    return o;
  }
  int cleared(double sanity, double max, bool onTime) const { return clearedScore(data, sanity, max, onTime); }
  int failed(double fraction) const { return failedScore(fraction); }
  double percent(const std::string& courseId, const val& scores) const { return coursePercent(data, courseId, toDoubles(scores)); }
  int credits(double percent) const { return creditsFor(data, percent); }
  double gpaOf(const val& points) const { return gpa(toDoubles(points)); }
  bool mercy(const std::string& courseId) const { return hasMercyPass(data, courseId); }

  val tic(const std::string& text, const std::string& profId) {
    const TicResult r = insertTic(data, text, profId, rng);
    val o = val::object();
    o.set("text", r.text);
    o.set("count", r.count);
    return o;
  }

  val campusBlocked() const { return copyInts(map.blocked()); }
  val campusBuildings() const { return copyInts(map.buildings()); }
  val campusBfs(int x, int y) const { return copyInts(map.bfs(x, y)); }
  double walkTiles(int sx, int sy, int tx, int ty) const { return map.walkTiles(sx, sy, tx, ty); }
};

class Arena {
 public:
  Arena(const Core& core, const val& cfg) {
    ArenaConfig c;
    c.courseId = cfg["courseId"].as<std::string>();
    c.stageIndex = static_cast<int>(number(cfg, "stageIndex"));
    if (cfg["upgrades"].isArray()) {
      const unsigned n = cfg["upgrades"]["length"].as<unsigned>();
      for (unsigned i = 0; i < n; i++) c.upgrades.push_back(cfg["upgrades"][i].as<std::string>());
    }
    c.firstCoffee = flag(cfg, "firstCoffee");
    c.lunch = flag(cfg, "lunch");
    c.maccoffee = static_cast<int>(number(cfg, "maccoffee", 3));
    c.nescafe = static_cast<int>(number(cfg, "nescafe", 0));
    c.seed = static_cast<uint32_t>(number(cfg, "seed", 1));
    sim = std::make_unique<ArenaSim>(core.data, c);
    paperBuf.resize(sim->papers().size() * kPaperStride);
    shotBuf.resize(sim->shots().size() * kShotStride);
    eshotBuf.resize(sim->enemyShots().size() * kShotStride);
  }

  static constexpr size_t kPaperStride = 10;  // active, kind, x, y, angle, scale, flash, soggy, hp, maxHp
  static constexpr size_t kShotStride = 5;    // active, tex, x, y, rotation

  void setSpriteSize(const std::string& kind, double w, double h) { sim->setSpriteSize(kind, w, h); }

  void step(double dt, const val& in) {
    ArenaInput i;
    i.moveX = number(in, "moveX");
    i.moveY = number(in, "moveY");
    i.fireHeld = flag(in, "fireHeld");
    i.hasAim = flag(in, "hasAim");
    i.aimX = number(in, "aimX");
    i.aimY = number(in, "aimY");
    i.autoAim = flag(in, "autoAim");
    i.coffee = flag(in, "coffee");
    i.dash = flag(in, "dash");
    i.help = flag(in, "help");
    i.reload = flag(in, "reload");
    sim->step(dt, i);
  }

  val events() {
    val out = val::array();
    for (const Event& e : sim->takeEvents()) {
      val o = val::object();
      o.set("type", std::string(evName(e.type)));
      o.set("key", e.key);
      o.set("x", e.x);
      o.set("y", e.y);
      o.set("a", e.a);
      o.set("b", e.b);
      o.set("tone", e.tone);
      out.call<void>("push", o);
    }
    return out;
  }

  // Views into wasm memory: valid until the next call into the module. Copy if you keep them.
  val papers() {
    const auto& ps = sim->papers();
    for (size_t i = 0; i < ps.size(); i++) {
      const Paper& p = ps[i];
      float* o = &paperBuf[i * kPaperStride];
      o[0] = p.active ? 1.f : 0.f;
      o[1] = static_cast<float>(p.kind);
      o[2] = static_cast<float>(p.x);
      o[3] = static_cast<float>(p.y);
      o[4] = static_cast<float>(p.angle);
      o[5] = static_cast<float>(1 - std::max(0.0, p.spawnT) / 0.35 * 0.8);
      o[6] = p.flash > 0 ? 1.f : 0.f;
      o[7] = p.soggy > 0 ? 1.f : 0.f;
      o[8] = static_cast<float>(p.hp);
      o[9] = static_cast<float>(p.maxHp);
    }
    return val(emscripten::typed_memory_view(paperBuf.size(), paperBuf.data()));
  }
  val shots() { return fillShots(sim->shots(), shotBuf); }
  val enemyShots() { return fillShots(sim->enemyShots(), eshotBuf); }

  val cups() const {
    val out = val::array();
    for (const Cup& c : sim->cups()) {
      val o = val::object();
      o.set("kind", c.kind == 1 ? "nescafe" : "maccoffee");
      o.set("sx", c.sx); o.set("sy", c.sy); o.set("tx", c.tx); o.set("ty", c.ty); o.set("t", c.t);
      out.call<void>("push", o);
    }
    return out;
  }

  val state() const {
    const ArenaSim& s = *sim;
    val o = val::object();
    const PlayerState& p = s.player();
    o.set("x", p.x); o.set("y", p.y); o.set("vx", p.vx); o.set("vy", p.vy);
    o.set("facing", p.facing); o.set("invuln", p.invuln); o.set("dashing", p.dashTimer > 0);
    o.set("sanity", s.sanity()); o.set("sanityMax", s.sanityMax());
    o.set("clip", s.clip()); o.set("clipMax", s.clipMax()); o.set("reloading", s.reloading());
    o.set("deadline", s.deadline()); o.set("deadlineMax", s.stage().deadline);
    o.set("frozen", s.frozen()); o.set("late", s.late()); o.set("wallX", s.wallX());
    o.set("assistReady", !s.assistUsed()); o.set("shield", s.shield());
    o.set("cleared", s.cleared()); o.set("ended", s.ended()); o.set("elapsed", s.elapsed());
    o.set("destroyed", s.destroyed()); o.set("total", s.totalHp());
    o.set("maccoffee", s.maccoffee()); o.set("nescafe", s.nescafe());
    o.set("eightAm", s.eightAm()); o.set("firstCoffeeTaken", s.firstCoffeeTaken());
    o.set("enemies", s.activeEnemies());
    o.set("hasExit", s.hasExit()); o.set("exitX", s.exitX()); o.set("exitY", s.exitY()); o.set("exitLocked", s.exitLocked());
    o.set("attendance", s.attendanceActive()); o.set("attendanceX", s.attendanceX()); o.set("attendanceY", s.attendanceY());
    const Boss& b = s.boss();
    if (b.alive) {
      val bo = val::object();
      bo.set("kind", b.kind); bo.set("hp", b.hp); bo.set("max", b.maxHp); bo.set("x", b.x); bo.set("y", b.y);
      bo.set("r", b.r); bo.set("state", b.state); bo.set("phase", b.phase); bo.set("flash", b.flash > 0);
      bo.set("soggy", b.soggy > 0); bo.set("tx", b.tx); bo.set("ty", b.ty);
      o.set("boss", bo);
    } else {
      o.set("boss", val::null());
    }
    const Rect& r = s.bounds();
    val bounds = val::object();
    bounds.set("x", r.x); bounds.set("y", r.y); bounds.set("w", r.w); bounds.set("h", r.h);
    o.set("bounds", bounds);
    return o;
  }

  val result() const {
    const StageResult& r = sim->result();
    val o = val::object();
    o.set("cleared", r.cleared); o.set("score", r.score); o.set("late", r.late); o.set("mercy", r.mercy);
    o.set("sanityLeft", r.sanityLeft); o.set("attendanceMissed", r.attendanceMissed);
    o.set("destroyedFraction", r.destroyedFraction); o.set("retake", r.retake);
    if (!r.achievement.empty()) o.set("achievement", r.achievement);
    return o;
  }

  void setInvulnerable(bool v) { sim->invulnerable = v; }
  void setAutoSubmit(bool v) { sim->autoSubmit = v; }
  void debugSpawn(const std::string& kind, int n) { sim->debugSpawn(kind, n); }
  void debugKillAll() { sim->debugKillAll(); }
  void debugDamagePlayer(double n) { sim->debugDamagePlayer(n); }
  void debugSetClip(int n) { sim->debugSetClip(n); }
  void debugSetSanity(double v) { sim->debugSetSanity(v); }
  void debugTeleport(double x, double y) { sim->debugTeleport(x, y); }
  void submit() { sim->submit(); }
  int activeEnemies() const { return sim->activeEnemies(); }

 private:
  std::unique_ptr<ArenaSim> sim;
  std::vector<float> paperBuf, shotBuf, eshotBuf;

  static val fillShots(const std::vector<Shot>& shots, std::vector<float>& buf) {
    for (size_t i = 0; i < shots.size(); i++) {
      const Shot& s = shots[i];
      float* o = &buf[i * kShotStride];
      o[0] = s.active ? 1.f : 0.f;
      o[1] = static_cast<float>(s.tex);
      o[2] = static_cast<float>(s.x);
      o[3] = static_cast<float>(s.y);
      o[4] = static_cast<float>(std::atan2(s.vy, s.vx));
    }
    return val(emscripten::typed_memory_view(buf.size(), buf.data()));
  }
};

// Paper kind names in the order their index appears in the papers() buffer.
val enemyKinds(const Core& core) {
  val out = val::array();
  for (const EnemyDef& e : core.data.enemies()) out.call<void>("push", e.id);
  return out;
}

EMSCRIPTEN_BINDINGS(cau_core) {
  emscripten::class_<Core>("Core")
      .constructor<std::string, std::string, std::string, std::string, std::string>()
      .function("stagePlan", &Core::stagePlan)
      .function("stage", &Core::stage)
      .function("letterFor", &Core::letter)
      .function("clearedScore", &Core::cleared)
      .function("failedScore", &Core::failed)
      .function("coursePercent", &Core::percent)
      .function("creditsFor", &Core::credits)
      .function("gpa", &Core::gpaOf)
      .function("hasMercyPass", &Core::mercy)
      .function("insertTic", &Core::tic)
      .function("campusBlocked", &Core::campusBlocked)
      .function("campusBuildings", &Core::campusBuildings)
      .function("campusBfs", &Core::campusBfs)
      .function("walkTiles", &Core::walkTiles);
  emscripten::function("enemyKinds", &enemyKinds);
  emscripten::class_<Arena>("Arena")
      .constructor<const Core&, val>()
      .function("setSpriteSize", &Arena::setSpriteSize)
      .function("step", &Arena::step)
      .function("events", &Arena::events)
      .function("papers", &Arena::papers)
      .function("shots", &Arena::shots)
      .function("enemyShots", &Arena::enemyShots)
      .function("cups", &Arena::cups)
      .function("state", &Arena::state)
      .function("result", &Arena::result)
      .function("setInvulnerable", &Arena::setInvulnerable)
      .function("setAutoSubmit", &Arena::setAutoSubmit)
      .function("debugSpawn", &Arena::debugSpawn)
      .function("debugKillAll", &Arena::debugKillAll)
      .function("debugDamagePlayer", &Arena::debugDamagePlayer)
      .function("debugSetClip", &Arena::debugSetClip)
      .function("debugSetSanity", &Arena::debugSetSanity)
      .function("debugTeleport", &Arena::debugTeleport)
      .function("submit", &Arena::submit)
      .function("activeEnemies", &Arena::activeEnemies);
}
