// Native tests for the C++ game core. Build and run with:  cmake -S cpp -B cpp/build && cmake --build cpp/build && ctest --test-dir cpp/build
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "../src/arena.hpp"
#include "../src/campus.hpp"
#include "../src/rules.hpp"

using namespace cau;

static int failures = 0, checks = 0;
#define CHECK(cond, ...)                                                    \
  do {                                                                      \
    checks++;                                                               \
    if (!(cond)) {                                                          \
      failures++;                                                           \
      std::printf("  FAIL %s:%d  %s  ", __FILE__, __LINE__, #cond);         \
      std::printf(__VA_ARGS__);                                             \
      std::printf("\n");                                                    \
    }                                                                       \
  } while (0)

static std::string readFile(const std::filesystem::path& p) {
  std::ifstream f(p, std::ios::binary);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

static GameData loadData() {
  const std::filesystem::path dir = CAU_DATA_DIR;
  std::string rooms = "[";
  bool first = true;
  for (const auto& e : std::filesystem::directory_iterator(dir / "rooms")) {
    if (e.path().extension() != ".json") continue;
    rooms += (first ? "" : ",") + readFile(e.path());
    first = false;
  }
  rooms += "]";
  GameData d;
  d.load(readFile(dir / "enemies.json"), readFile(dir / "courses.json"), readFile(dir / "professors.json"), readFile(dir / "campus.json"), rooms);
  return d;
}

static void test(const char* name, const std::function<void()>& fn) {
  const int before = failures;
  const auto t0 = std::chrono::steady_clock::now();
  fn();
  const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  std::printf("%s %s (%.0f ms)\n", failures == before ? "ok  " : "FAIL", name, ms);
}

// A scripted, invulnerable student: strafes along the front of the room and lets auto-aim do the shooting.
struct BotRun { bool ended = false; StageResult result; double seconds = 0; };
static BotRun runBot(const GameData& d, const std::string& course, int stage, uint32_t seed, bool invulnerable = true, double limit = 400) {
  ArenaConfig cfg;
  cfg.courseId = course;
  cfg.stageIndex = stage;
  cfg.seed = seed;
  ArenaSim sim(d, cfg);
  sim.invulnerable = invulnerable;
  sim.autoSubmit = true;
  const double dt = 1.0 / 60;
  double t = 0;
  while (!sim.ended() && t < limit) {
    ArenaInput in;
    in.autoAim = true;
    const double a = t / 1.4;
    in.moveX = (std::sin(a) >= 0 ? 1 : -1) * 0.8;
    in.moveY = std::cos(a * 3) * 0.3;
    sim.step(dt, in);
    sim.takeEvents();
    t += dt;
  }
  return {sim.ended(), sim.result(), t};
}

int main() {
  const GameData d = loadData();

  test("stage health totals match stageSizing", [&] {
    const Json& sz = d.balance()["stageSizing"];
    for (const Course& c : d.courses())
      for (size_t i = 0; i < c.components.size(); i++) {
        const Stage s = buildStage(d, c.id, static_cast<int>(i));
        const double budget = sz["courseHpBudget"].num() * c.components[i].weight / 100;
        CHECK(s.hpBudget == budget, "%s/%zu budget %g != %g", c.id.c_str(), i, s.hpBudget, budget);
        CHECK(stageTotalHp(s) == budget, "%s/%zu total %g != %g", c.id.c_str(), i, stageTotalHp(s), budget);
        CHECK(s.deadline == sz["deadlineSeconds"]["base"].num() + sz["deadlineSeconds"]["perWeightPoint"].num() * c.components[i].weight, "deadline");
        if (c.components[i].type == "midterm") CHECK(s.boss == "midterm_paper", "midterm boss");
        if (c.components[i].type == "final") CHECK(s.boss == "final_exam", "final boss");
        if (s.boss.empty()) CHECK(!s.waves.empty(), "waves");
      }
  });

  test("grades: scores, letters, GPA, credits, mercy pass", [&] {
    CHECK(letterFor(d, 92).letter == "A", "");
    CHECK(letterFor(d, 80).letter == "B", "");
    CHECK(letterFor(d, 59.9).letter == "F", "");
    CHECK(clearedScore(d, 100, 100, true) == 100, "%d", clearedScore(d, 100, 100, true));
    CHECK(clearedScore(d, 0, 100, false) == 70, "");
    CHECK(clearedScore(d, 50, 100, true) == 90, "%d", clearedScore(d, 50, 100, true));
    CHECK(failedScore(0.5) == 20, "");
    CHECK(coursePercent(d, "computer_programming", {100, 100, 100, 100}) == 100, "");
    CHECK(std::fabs(coursePercent(d, "computer_programming", {70, 70, 90, 80}) - 79) < 1e-9, "%g", coursePercent(d, "computer_programming", {70, 70, 90, 80}));
    CHECK(gpa({4, 3, 2}) == 3, "");
    CHECK(gpa({}) == 0, "");
    CHECK(creditsFor(d, 78.4) == 78, "");
    CHECK(hasMercyPass(d, "computer_programming"), "");
    CHECK(!hasMercyPass(d, "engineering_physics"), "");
  });

  test("Metroman's tic: about half the boxes, never twice in one", [&] {
    Rng rng(42);
    int boxes = 0, with = 0, doubles = 0;
    for (int i = 0; i < 4000; i++) {
      const TicResult r = insertTic(d, "Mechanics, electromagnetism {tic}. And {tic} again {tic}.", "prof_metroman", rng);
      boxes++;
      if (r.count) with++;
      if (r.count > 1 || r.text.find("{tic}") != std::string::npos) doubles++;
    }
    const double ratio = static_cast<double>(with) / boxes;
    CHECK(doubles == 0, "%d", doubles);
    CHECK(ratio > 0.6 && ratio < 0.95, "%g", ratio);  // three chances per box at 50% each, capped at one
    const TicResult none = insertTic(d, "Calculus {tic}.", "prof_bezout", rng);
    CHECK(none.text == "Calculus.", "'%s'", none.text.c_str());
  });

  test("campus: every walkable tile reachable, crossing takes 20-30 s", [&] {
    CampusMap m;
    m.load(d);
    const Json& c = d.campus();
    const std::vector<int> dist = m.bfs(c["playerStart"][0].integer(), c["playerStart"][1].integer());
    int walk = 0, reached = 0;
    for (int y = 0; y < m.height(); y++)
      for (int x = 0; x < m.width(); x++)
        if (m.walkable(x, y)) { walk++; if (dist[static_cast<size_t>(y * m.width() + x)] >= 0) reached++; }
    CHECK(walk > 9000 && reached == walk, "%d/%d", reached, walk);
    const Json* gate = nullptr;
    for (const Json& g : c["gates"].elements()) if (g["id"].str() == "south_gate") gate = &g;
    const Json* nw = nullptr;
    for (const Json& b : c["buildings"].elements()) if (b["id"].str() == "nw") nw = &b["doors"][0]["front"];
    const double tiles = m.walkTiles((*gate)["at"][0].integer(), (*gate)["at"][1].integer(), (*nw)[0].integer(), (*nw)[1].integer());
    const double secs = tiles * c["tileSize"].num() / d.balance()["player"]["campusSpeed"].num();
    CHECK(secs >= 20 && secs <= 30, "%g s", secs);
    // Annexes sit inside the main complex's bbox but must be separate buildings.
    const int mainIdx = m.buildings()[static_cast<size_t>(35 * m.width() + 82)];
    const int annexIdx = m.buildings()[static_cast<size_t>(24 * m.width() + 66)];
    CHECK(mainIdx >= 0 && annexIdx >= 0 && mainIdx != annexIdx, "%d %d", mainIdx, annexIdx);
  });

  test("every stage of every course can be cleared by a scripted player", [&] {
    for (const Course& c : d.courses())
      for (size_t i = 0; i < c.components.size(); i++) {
        const Stage s = buildStage(d, c.id, static_cast<int>(i));
        const BotRun r = runBot(d, c.id, static_cast<int>(i), 7 + static_cast<uint32_t>(i));
        CHECK(r.ended && r.result.cleared, "%s/%zu not cleared after %.0f s", c.id.c_str(), i, r.seconds);
        CHECK(r.seconds < s.deadline + 15, "%s/%zu took %.0f s (deadline %.0f)", c.id.c_str(), i, r.seconds, s.deadline);
        std::printf("       %-24s %-9s %5.1f s / deadline %3.0f s  score %d\n", c.id.c_str(), s.type.c_str(), r.seconds, s.deadline, r.result.score);
      }
  });

  test("failing: mercy pass for Prof. Admin Manzur, retake elsewhere", [&] {
    for (const char* course : {"computer_programming", "calculus_for_engineers"}) {
      ArenaConfig cfg;
      cfg.courseId = course;
      ArenaSim sim(d, cfg);
      sim.step(1.0 / 60, ArenaInput{});
      sim.debugDamagePlayer(1000);
      CHECK(sim.ended(), "%s", course);
      if (std::string(course) == "computer_programming") CHECK(sim.result().mercy && sim.result().score == 70 && !sim.result().retake, "mercy");
      else CHECK(!sim.result().mercy && sim.result().retake && sim.result().score <= 40, "retake");
    }
  });

  test("an idle student loses Sanity and fails", [&] {
    const BotRun r = runBot(d, "engineering_physics", 1, 3, /*invulnerable=*/false, 300);
    CHECK(r.ended, "ended");
    CHECK(!r.result.cleared || r.result.sanityLeft < 100, "took damage");
  });

  test("the same seed replays the same fight", [&] {
    const BotRun a = runBot(d, "calculus_for_engineers", 0, 99);
    const BotRun b = runBot(d, "calculus_for_engineers", 0, 99);
    CHECK(a.seconds == b.seconds && a.result.score == b.result.score, "%g vs %g", a.seconds, b.seconds);
  });

  test("professor assists: once per stage, each does its own thing", [&] {
    for (const char* course : {"computer_programming", "engineering_physics"}) {
      ArenaConfig cfg;
      cfg.courseId = course;
      ArenaSim sim(d, cfg);
      sim.debugSetSanity(30);
      ArenaInput help;
      help.help = true;
      const double before = sim.deadline();
      sim.step(1.0 / 60, help);
      if (std::string(course) == "computer_programming") CHECK(sim.sanity() == 70, "Stress detected: %g", sim.sanity());
      else {
        CHECK(sim.frozen(), "Time dilation freezes the deadline");
        for (int i = 0; i < 60; i++) sim.step(1.0 / 60, ArenaInput{});
        CHECK(sim.deadline() == before, "deadline moved %g -> %g", before, sim.deadline());
      }
      CHECK(sim.assistUsed(), "used");
      sim.debugSetSanity(30);
      sim.step(1.0 / 60, help);
      CHECK(sim.sanity() == 30, "second call must do nothing: %g", sim.sanity());
    }
  });

  test("Isometry: papers cannot come closer", [&] {
    ArenaConfig cfg;
    cfg.courseId = "calculus_for_engineers";
    ArenaSim sim(d, cfg);
    sim.invulnerable = true;
    sim.debugSpawn("homework", 6);
    for (int i = 0; i < 40; i++) sim.step(1.0 / 60, ArenaInput{});  // let them finish spawning
    ArenaInput help;
    help.help = true;
    sim.step(1.0 / 60, help);
    auto nearest = [&] {
      double best = 1e9;
      for (const Paper& p : sim.papers()) if (p.active) best = std::min(best, std::hypot(p.x - sim.player().cx(), p.y - sim.player().cy()));
      return best;
    };
    const double before = nearest();
    for (int i = 0; i < 120; i++) sim.step(1.0 / 60, ArenaInput{});
    CHECK(nearest() >= before - 2, "%g -> %g", before, nearest());
  });

  test("60 papers: one simulation step stays well under a frame", [&] {
    ArenaConfig cfg;
    cfg.courseId = "calculus_for_engineers";
    ArenaSim sim(d, cfg);
    sim.invulnerable = true;
    sim.debugSpawn("quiz", 60);
    ArenaInput in;  // no shooting: keep all 60 alive while timing
    const auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < 600; i++) { sim.step(1.0 / 60, in); sim.takeEvents(); }
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count() / 600;
    std::printf("       %.3f ms per step with %d papers\n", ms, sim.activeEnemies());
    CHECK(ms < 2, "%g ms", ms);
  });

  std::printf("\n%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
