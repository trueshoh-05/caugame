#include "rules.hpp"

#include <algorithm>
#include <cmath>

namespace cau {

std::vector<std::vector<Spawn>> buildWaves(const GameData& d, const std::string& kind, double budget) {
  const Json& cfg = d.balance()["stageSizing"]["waves"][kind];
  std::vector<std::pair<std::string, double>> mix;
  for (const auto& kv : cfg["mix"].items()) mix.emplace_back(kv.first, kv.second.num());
  // Biggest papers first, so they get their share before the budget runs out.
  std::stable_sort(mix.begin(), mix.end(), [&](const auto& a, const auto& b) { return d.enemy(a.first).hp > d.enemy(b.first).hp; });

  double remaining = budget;
  std::vector<Spawn> spawns;
  for (const auto& [type, share] : mix) {
    const double hp = d.enemy(type).hp;
    int n = static_cast<int>(jsRound(budget * share / hp));
    if (n == 0 && share > 0 && remaining >= hp) n = 1;
    n = std::min(n, static_cast<int>(std::floor(remaining / hp)));
    for (int i = 0; i < n; i++) spawns.push_back({type, hp});
    remaining -= n * hp;
  }
  const std::string smallest = mix.back().first;
  const double sHp = d.enemy(smallest).hp;
  while (remaining >= sHp) { spawns.push_back({smallest, sHp}); remaining -= sHp; }
  if (remaining > 0) {
    // Leftover health goes onto one extra-tough paper so the totals match exactly.
    if (spawns.empty()) spawns.push_back({smallest, sHp});
    spawns.back().hp += remaining;
  }
  // Deal the papers into waves, biggest first, always onto the lightest wave so far.
  const int waveCount = cfg["waveCount"].integer(1);
  std::vector<std::vector<Spawn>> waves(static_cast<size_t>(waveCount));
  std::vector<double> totals(static_cast<size_t>(waveCount), 0);
  std::vector<Spawn> sorted = spawns;
  std::stable_sort(sorted.begin(), sorted.end(), [](const Spawn& a, const Spawn& b) { return a.hp > b.hp; });
  for (const Spawn& s : sorted) {
    size_t i = static_cast<size_t>(std::min_element(totals.begin(), totals.end()) - totals.begin());
    waves[i].push_back(s);
    totals[i] += s.hp;
  }
  waves.erase(std::remove_if(waves.begin(), waves.end(), [](const auto& w) { return w.empty(); }), waves.end());
  return waves;
}

Stage buildStage(const GameData& d, const std::string& courseId, int index) {
  const Course& c = d.course(courseId);
  const Component& comp = c.components.at(static_cast<size_t>(index));
  const Json& sz = d.balance()["stageSizing"];
  Stage s;
  s.courseId = courseId;
  s.index = index;
  s.type = comp.type;
  s.weight = comp.weight;
  s.hpBudget = jsRound(sz["courseHpBudget"].num() * comp.weight / 100.0);
  s.deadline = sz["deadlineSeconds"]["base"].num() + sz["deadlineSeconds"]["perWeightPoint"].num() * comp.weight;
  if (comp.type == "midterm") s.boss = "midterm_paper";
  else if (comp.type == "final") s.boss = "final_exam";
  else s.waves = buildWaves(d, comp.type, s.hpBudget);
  return s;
}

double stageTotalHp(const Stage& s) {
  if (!s.boss.empty()) return s.hpBudget;
  double t = 0;
  for (const auto& w : s.waves) for (const auto& sp : w) t += sp.hp;
  return t;
}

Letter letterFor(const GameData& d, double percent) {
  const auto& bands = d.gradeBands();
  for (const auto& b : bands) if (percent >= b.min) return {b.letter, b.points};
  return bands.empty() ? Letter{"F", 0} : Letter{bands.back().letter, bands.back().points};
}

int clearedScore(const GameData& d, double sanityLeft, double sanityMax, bool onTime) {
  const Json& sc = d.balance()["scoring"];
  const double frac = std::max(0.0, std::min(1.0, sanityLeft / sanityMax));
  return static_cast<int>(sc["cleared"].num() + jsRound(sc["sanityBonusMax"].num() * frac) + (onTime ? sc["onTimeBonus"].num() : 0));
}

int failedScore(double fractionDestroyed) {
  return static_cast<int>(jsRound(40 * std::max(0.0, std::min(1.0, fractionDestroyed))));
}

double coursePercent(const GameData& d, const std::string& courseId, const std::vector<double>& stageScores) {
  const Course& c = d.course(courseId);
  double total = 0;
  for (size_t i = 0; i < c.components.size(); i++) total += (i < stageScores.size() ? stageScores[i] : 0) * c.components[i].weight / 100.0;
  return jsRound(total * 10) / 10;
}

int creditsFor(const GameData& d, double percent) {
  return static_cast<int>(jsRound(percent * d.balance()["scoring"]["creditsPerCoursePercent"].num(1)));
}

double gpa(const std::vector<double>& points) {
  if (points.empty()) return 0;
  double sum = 0;
  for (double p : points) sum += p;
  return jsRound(sum / static_cast<double>(points.size()) * 100) / 100;
}

bool hasMercyPass(const GameData& d, const std::string& courseId) {
  return d.professor(d.course(courseId).professor).personalityRule == "mercy_pass";
}

TicResult insertTic(const GameData& d, const std::string& text, const std::string& profId, Rng& rng) {
  const Professor& p = d.professor(profId);
  TicResult r;
  const std::string marker = "{tic}";
  size_t pos = 0;
  while (pos < text.size()) {
    size_t at = text.find(marker, pos);
    if (at == std::string::npos) { r.text += text.substr(pos); break; }
    std::string before = text.substr(pos, at - pos);
    while (!before.empty() && (before.back() == ' ' || before.back() == '\t' || before.back() == '\n')) before.pop_back();
    r.text += before;
    if (!p.ticPhrase.empty() && r.count < p.ticMaxPerBox && rng.uniform() < p.ticChance) { r.text += " " + p.ticPhrase; r.count++; }
    pos = at + marker.size();
  }
  return r;
}

}  // namespace cau
