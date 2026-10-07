// Course rules: stages built from grade components, scoring, letters, GPA, and dialog tics.
#pragma once
#include <cmath>
#include <string>
#include <vector>

#include "data.hpp"
#include "rng.hpp"

namespace cau {

// JavaScript's Math.round (halves round up), so C++ and the web game agree to the point.
inline double jsRound(double x) { return std::floor(x + 0.5); }

struct Spawn { std::string type; double hp = 0; };  // hp already includes any leftover-budget boost

struct Stage {
  std::string courseId;
  int index = 0;
  std::string type;
  int weight = 0;
  double hpBudget = 0;
  double deadline = 0;
  std::vector<std::vector<Spawn>> waves;  // empty for boss stages
  std::string boss;                        // "midterm_paper", "final_exam" or ""
};

std::vector<std::vector<Spawn>> buildWaves(const GameData& d, const std::string& kind, double budget);
Stage buildStage(const GameData& d, const std::string& courseId, int index);
double stageTotalHp(const Stage& s);

struct Letter { std::string letter; double points = 0; };
Letter letterFor(const GameData& d, double percent);
int clearedScore(const GameData& d, double sanityLeft, double sanityMax, bool onTime);
int failedScore(double fractionDestroyed);
double coursePercent(const GameData& d, const std::string& courseId, const std::vector<double>& stageScores);
int creditsFor(const GameData& d, double percent);
double gpa(const std::vector<double>& points);
bool hasMercyPass(const GameData& d, const std::string& courseId);

struct TicResult { std::string text; int count = 0; };
// Replace each "{tic}" (and the whitespace before it) with " <phrase>" with the professor's
// chance, at most maxPerBox times per box; otherwise remove it.
TicResult insertTic(const GameData& d, const std::string& text, const std::string& profId, Rng& rng);

}  // namespace cau
