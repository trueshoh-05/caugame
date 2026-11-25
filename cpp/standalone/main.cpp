// CAU: Semester Survivor — standalone terminal edition.
//
// The same C++ game core as the browser version (rules, stages, grades, the arena fight),
// with a text-mode front end: coloured characters in your terminal and keyboard controls.
// All game data (balance, courses, professors, rooms, text in en/ru/uz) is built in.
//
//   clang++ -std=c++17 -O2 cau_semester_survivor.cpp -o cau && ./cau
//   g++     -std=c++17 -O2 cau_semester_survivor.cpp -o cau && ./cau
//   cl /std:c++17 /O2 /EHsc cau_semester_survivor.cpp            (Windows)
//
// Options:  --lang en|ru|uz   --bot (watch a scripted student play a whole semester)
//           --reset (forget saved progress)
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "../src/arena.hpp"
#include "../src/data.hpp"
#include "../src/json.hpp"
#include "../src/rules.hpp"
#include "embedded_data.hpp"

#ifdef _WIN32
#include <conio.h>
#include <windows.h>
#else
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>
#endif

using namespace cau;

// ============================================================================ terminal

namespace term {

#ifdef _WIN32
void enableRaw() {
  HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
  DWORD mode = 0;
  if (GetConsoleMode(out, &mode)) SetConsoleMode(out, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
  SetConsoleOutputCP(CP_UTF8);
}
void restore() {}
// Returns -1 when no key is waiting. Arrow keys come back as 1000 + 'A'..'D' (up, down, right, left).
int readKey() {
  if (!_kbhit()) return -1;
  int c = _getch();
  if (c == 0 || c == 224) {
    int a = _getch();
    if (a == 72) return 1000 + 'A';
    if (a == 80) return 1000 + 'B';
    if (a == 77) return 1000 + 'C';
    if (a == 75) return 1000 + 'D';
    return -1;
  }
  return c;
}
bool size(int& cols, int& rows) {
  CONSOLE_SCREEN_BUFFER_INFO info;
  if (!GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &info)) return false;
  cols = info.srWindow.Right - info.srWindow.Left + 1;
  rows = info.srWindow.Bottom - info.srWindow.Top + 1;
  return true;
}
#else
termios saved;
bool rawOn = false;
void enableRaw() {
  if (!isatty(STDIN_FILENO)) return;
  tcgetattr(STDIN_FILENO, &saved);
  termios t = saved;
  t.c_lflag &= static_cast<tcflag_t>(~(ICANON | ECHO));
  t.c_cc[VMIN] = 0;
  t.c_cc[VTIME] = 0;
  tcsetattr(STDIN_FILENO, TCSANOW, &t);
  rawOn = true;
}
void restore() {
  if (rawOn) tcsetattr(STDIN_FILENO, TCSANOW, &saved);
  rawOn = false;
}
int readByte() {
  unsigned char c;
  return read(STDIN_FILENO, &c, 1) == 1 ? c : -1;
}
int readKey() {
  int c = readByte();
  if (c != 27) return c;
  int a = readByte();
  if (a != '[') return 27;
  int b = readByte();
  if (b >= 'A' && b <= 'D') return 1000 + b;
  return -1;
}
bool size(int& cols, int& rows) {
  winsize w{};
  if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &w) != 0 || w.ws_col == 0) return false;
  cols = w.ws_col;
  rows = w.ws_row;
  return true;
}
#endif

void write(const std::string& s) {
  std::fwrite(s.data(), 1, s.size(), stdout);
  std::fflush(stdout);
}
void clear() { write("\x1b[2J\x1b[H"); }
void hideCursor(bool hide) { write(hide ? "\x1b[?25l" : "\x1b[?25h"); }
void sleepMs(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

// Wait for any key (bot mode: just pause briefly).
int waitKey(bool bot, int botMs = 600) {
  if (bot) { sleepMs(botMs); return '\n'; }
  for (;;) {
    int k = readKey();
    if (k >= 0) return k;
    sleepMs(15);
  }
}

}  // namespace term

// Colours (ANSI).
namespace col {
const char* reset = "\x1b[0m";
const char* bold = "\x1b[1m";
const char* dim = "\x1b[2m";
const char* red = "\x1b[31m";
const char* green = "\x1b[32m";
const char* yellow = "\x1b[33m";
const char* blue = "\x1b[34m";
const char* magenta = "\x1b[35m";
const char* cyan = "\x1b[36m";
const char* white = "\x1b[97m";
const char* gray = "\x1b[90m";
const char* bgRed = "\x1b[41m";
const char* bgBlue = "\x1b[44m";
const char* bgGray = "\x1b[100m";
const char* tone(int t) {
  switch (t) {
    case ToneAccent: return yellow;
    case ToneRed: return red;
    case ToneGreen: return green;
    case ToneCyan: return cyan;
    case ToneDim: return gray;
    default: return white;
  }
}
}  // namespace col

// ============================================================================ text

class Text {
 public:
  void load(const std::string& lang) {
    en_ = Json::parse(embedded::text("en"));
    const std::string other = embedded::text(lang);
    cur_ = other.empty() ? en_ : Json::parse(other);
    lang_ = other.empty() ? "en" : lang;
  }
  const std::string& lang() const { return lang_; }

  const Json& raw(const std::string& path) const {
    const Json& v = lookup(cur_, path);
    return v.isNull() ? lookup(en_, path) : v;
  }

  std::string t(const std::string& path, const std::map<std::string, std::string>& vars = {}) const {
    const Json& v = raw(path);
    std::string s = v.isString() ? v.str() : path;
    for (const auto& [k, val] : vars) {
      const std::string key = "{" + k + "}";
      for (size_t p = s.find(key); p != std::string::npos; p = s.find(key, p + val.size())) s.replace(p, key.size(), val);
    }
    return s;
  }

 private:
  Json en_, cur_;
  std::string lang_ = "en";
  static const Json& lookup(const Json& root, const std::string& path) {
    const Json* node = &root;
    size_t start = 0;
    while (start <= path.size()) {
      size_t dot = path.find('.', start);
      node = &(*node)[path.substr(start, dot == std::string::npos ? std::string::npos : dot - start)];
      if (dot == std::string::npos) break;
      start = dot + 1;
    }
    return *node;
  }
};

std::string fmtNum(double v, int decimals = 0) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%.*f", decimals, v);
  return buf;
}

// A professor line: plain text (with {tic}), a formula on a whiteboard, or an aside in another language.
struct Line { std::string text; bool formula = false; std::string lang; int tics = 0; };

// ============================================================================ save

struct SaveData {
  std::map<std::string, std::vector<double>> progress;
  struct Result { double percent = 0; std::string letter; double points = 0; bool mercy = false; };
  std::map<std::string, Result> results;
  std::map<std::string, int> wins;
  std::vector<std::string> accepted, upgrades, achievements;
  int credits = 0, maccoffee = 3, nescafe = 0, ticCount = 0;
  bool firstCoffee = false;
  std::string lang = "en";

  static std::string path() { return "cau_save.txt"; }

  void write() const {
    std::ofstream f(path());
    f << "lang " << lang << "\ncredits " << credits << "\nammo " << maccoffee << " " << nescafe << "\nfirstCoffee " << firstCoffee << "\ntics " << ticCount << "\n";
    for (const auto& a : accepted) f << "accepted " << a << "\n";
    for (const auto& u : upgrades) f << "upgrade " << u << "\n";
    for (const auto& a : achievements) f << "achievement " << a << "\n";
    for (const auto& [c, w] : wins) f << "wins " << c << " " << w << "\n";
    for (const auto& [c, p] : progress) { f << "progress " << c; for (double s : p) f << " " << s; f << "\n"; }
    for (const auto& [c, r] : results) f << "result " << c << " " << r.percent << " " << r.letter << " " << r.points << " " << r.mercy << "\n";
  }

  void read() {
    std::ifstream f(path());
    std::string line;
    while (std::getline(f, line)) {
      std::istringstream in(line);
      std::string k;
      in >> k;
      if (k == "lang") in >> lang;
      else if (k == "credits") in >> credits;
      else if (k == "ammo") in >> maccoffee >> nescafe;
      else if (k == "firstCoffee") in >> firstCoffee;
      else if (k == "tics") in >> ticCount;
      else if (k == "accepted") { std::string v; in >> v; accepted.push_back(v); }
      else if (k == "upgrade") { std::string v; in >> v; upgrades.push_back(v); }
      else if (k == "achievement") { std::string v; in >> v; achievements.push_back(v); }
      else if (k == "wins") { std::string c; int w = 0; in >> c >> w; wins[c] = w; }
      else if (k == "progress") { std::string c; in >> c; double s; while (in >> s) progress[c].push_back(s); }
      else if (k == "result") { std::string c; Result r; in >> c >> r.percent >> r.letter >> r.points >> r.mercy; results[c] = r; }
    }
  }
};

bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

// ============================================================================ game

class Game {
 public:
  Game(bool bot, const std::string& langArg, bool reset) : bot_(bot) {
    data_.load(embedded::enemies(), embedded::courses(), embedded::professors(), embedded::campus(), embedded::rooms());
    if (!reset && !bot) save_.read();
    if (!langArg.empty()) save_.lang = langArg;
    text_.load(save_.lang);
    rng_.reseed(static_cast<uint32_t>(std::chrono::steady_clock::now().time_since_epoch().count()) | 1u);
    if (bot) rng_.reseed(12345);
  }

  int run() {
    title();
    for (;;) {
      const int choice = semesterMenu();
      if (choice < 0) break;
      if (choice == 99) { transcript(); if (bot_) break; continue; }
      playCourse(data_.semesterOrder()[static_cast<size_t>(choice)]);
      persist();
    }
    return 0;
  }

 private:
  bool bot_;
  GameData data_;
  Text text_;
  SaveData save_;
  Rng rng_;

  void persist() { if (!bot_) save_.write(); }

  // ---------------------------------------------------------------- dialog lines

  Line makeLine(const Json& j, const std::string& profId) {
    Line l;
    if (j.isString()) {
      const TicResult r = insertTic(data_, j.str(), profId, rng_);
      l.text = r.text;
      l.tics = r.count;
    } else if (j.has("formula")) {
      l.text = j["formula"].str();
      l.formula = true;
    } else {
      const TicResult r = insertTic(data_, j["text"].str(), profId, rng_);
      l.text = r.text;
      l.tics = r.count;
      l.lang = j["lang"].str("");
    }
    return l;
  }

  std::vector<Line> lines(const std::string& profId, const std::string& kind) {
    std::vector<Line> out;
    for (const Json& j : text_.raw("professors." + profId + "." + kind).elements()) out.push_back(makeLine(j, profId));
    return out;
  }

  Line oneLine(const std::string& profId, const std::string& kind) {
    const auto& all = text_.raw("professors." + profId + "." + kind).elements();
    if (all.empty()) return {};
    return makeLine(all[static_cast<size_t>(rng_.uniform() * all.size())], profId);
  }

  void countTics(const Line& l, const Professor& p) {
    if (!l.tics) return;
    save_.ticCount += l.tics;
    if (!p.ticPhrase.empty() && save_.ticCount >= 50 && !has(save_.achievements, p.achievementId)) {
      save_.achievements.push_back(p.achievementId);
      term::write(std::string("\n  ") + col::yellow + "★ " + text_.t("ui.achievement", {{"name", text_.t("achievements." + p.achievementId)}}) + col::reset + "\n");
    }
  }

  std::string formatLine(const Line& l) const {
    if (l.formula) return std::string(col::bgGray) + col::white + col::bold + "  " + l.text + "  " + col::reset;
    if (!l.lang.empty()) return std::string(col::cyan) + l.text + col::gray + "  (" + l.lang + ")" + col::reset;
    return l.text;
  }

  void dialog(const Professor& p, const std::vector<Line>& ls) {
    for (const Line& l : ls) {
      term::write(std::string("\n  ") + col::yellow + col::bold + p.displayName + col::reset + "\n  ");
      const std::string s = formatLine(l);
      if (bot_ || l.formula) term::write(s);
      else for (char ch : s) { term::write(std::string(1, ch)); term::sleepMs(12); }
      countTics(l, p);
      term::write(std::string("\n  ") + col::gray + "▼" + col::reset);
      term::waitKey(bot_, 150);
      term::write("\r   \r");
    }
  }

  // ---------------------------------------------------------------- screens

  void title() {
    term::clear();
    term::write(std::string("\n\n  ") + col::yellow + col::bold + text_.t("ui.title") + col::reset + "\n");
    term::write(std::string("  ") + col::gray + text_.t("ui.subtitle") + col::reset + "\n\n");
    term::write(std::string("  ") + col::cyan + "@" + col::reset + "  ;  ;  ;   " + col::white + "[q]  [h]  [L]" + col::reset + "\n\n");
    const auto& tips = text_.raw("loadingTips").elements();
    if (!tips.empty()) term::write(std::string("  ") + col::gray + tips[static_cast<size_t>(rng_.uniform() * tips.size())].str() + col::reset + "\n\n");
    term::write("  WASD / arrows: move   Space: dash   Q: coffee   H: help   R: reload   X: leave\n");
    term::write("  Semicolons fire automatically at the nearest paper.\n\n");
    term::write(std::string("  ") + col::bold + "> " + text_.t("ui.tapToStart") + col::reset + "  (Enter)\n");
    term::waitKey(bot_, 300);
  }

  // Returns the course index, 99 for the transcript, or -1 to quit.
  int semesterMenu() {
    const auto& order = data_.semesterOrder();
    const bool allDone = std::all_of(order.begin(), order.end(), [&](const std::string& c) { return save_.results.count(c) > 0; });
    if (bot_) {
      for (size_t i = 0; i < order.size(); i++) if (!save_.results.count(order[i])) return static_cast<int>(i);
      return 99;
    }
    for (;;) {
      term::clear();
      term::write(std::string("\n  ") + col::yellow + col::bold + text_.t("ui.title") + col::reset + col::gray + "   " + text_.t("ui.credits") + ": " + std::to_string(save_.credits) + col::reset + "\n\n");
      for (size_t i = 0; i < order.size(); i++) {
        const Course& c = data_.course(order[i]);
        const Professor& p = data_.professor(c.professor);
        std::string status;
        if (save_.results.count(c.id)) status = std::string(col::green) + save_.results[c.id].letter + " (" + fmtNum(save_.results[c.id].percent, 1) + "%)" + col::reset;
        else if (save_.progress.count(c.id)) status = std::string(col::yellow) + text_.t("ui.stageOf", {{"n", std::to_string(save_.progress[c.id].size() + 1)}, {"total", std::to_string(c.components.size())}}) + col::reset;
        else status = std::string(col::gray) + "—" + col::reset;
        term::write("  " + std::string(col::bold) + std::to_string(i + 1) + ")" + col::reset + " " + c.name + col::gray + "  ·  " + p.displayName + col::reset + "   " + status + "\n");
      }
      term::write("\n");
      if (allDone) term::write(std::string("  ") + col::bold + "T)" + col::reset + " " + text_.t("ui.transcript") + "\n");
      term::write(std::string("  ") + col::bold + "L)" + col::reset + " " + text_.t("ui.language") + ": " + text_.lang() + "    " + col::bold + "X)" + col::reset + " quit\n");
      if (!save_.achievements.empty()) {
        term::write("\n  ");
        for (const auto& a : save_.achievements) term::write(std::string(col::yellow) + "★ " + text_.t("achievements." + a) + "  " + col::reset);
        term::write("\n");
      }
      const int k = term::waitKey(false);
      if (k >= '1' && k < '1' + static_cast<int>(order.size())) {
        if (save_.results.count(order[static_cast<size_t>(k - '1')])) continue;
        return k - '1';
      }
      if ((k == 't' || k == 'T') && allDone) return 99;
      if (k == 'l' || k == 'L') {
        save_.lang = save_.lang == "en" ? "ru" : save_.lang == "ru" ? "uz" : "en";
        text_.load(save_.lang);
        persist();
      }
      if (k == 'x' || k == 'X' || k == 27) return -1;
    }
  }

  void questCard(const Course& c) {
    const Professor& p = data_.professor(c.professor);
    const Room& room = data_.room(c.arena);
    term::write(std::string("\n  ") + col::bgBlue + col::white + " " + text_.t("questCard.portalHeader") + " " + col::reset + "\n");
    term::write(std::string("  ") + col::bold + c.name + col::reset + "\n");
    term::write(std::string("  ") + col::gray + text_.t("questCard.professor") + ": " + p.displayName + "  ·  " + text_.t("questCard.room") + ": " + room.name + col::reset + "\n\n");
    const Json coursesJson = Json::parse(embedded::courses());
    const Json* cj = nullptr;
    for (const Json& e : coursesJson["courses"].elements()) if (e["id"].str() == c.id) cj = &e;
    auto field = [&](const std::string& label, const std::string& key) {
      const std::string v = cj ? (*cj)["portalPage"][key].str() : "";
      const bool none = v.empty() || v == "No data";
      term::write(std::string("  ") + col::blue + col::bold + text_.t("questCard." + label) + col::reset + "\n  " + (none ? col::gray : col::white) + (none ? text_.t("questCard.noData") : v) + col::reset + "\n");
    };
    field("courseDescription", "description");
    field("objectives", "objectives");
    field("learningOutcomes", "learningOutcomes");
    term::write(std::string("  ") + col::blue + col::bold + text_.t("questCard.gradeComponents") + col::reset + "\n");
    for (const Component& comp : c.components) {
      std::string name = text_.t("questCard.components." + comp.type);
      name.resize(std::max<size_t>(name.size(), 26), ' ');
      term::write("    " + name + col::red + std::to_string(comp.weight) + "%" + col::reset + "\n");
    }
    field("coreReading", "coreReading");
    field("guidedIndependentStudy", "guidedIndependentStudy");
    term::write(std::string("\n  ") + col::bold + "> " + text_.t("ui.accept") + col::reset + " (Enter)\n");
    term::waitKey(bot_, 200);
  }

  void playCourse(const std::string& courseId) {
    const Course& c = data_.course(courseId);
    const Professor& prof = data_.professor(c.professor);
    term::clear();
    if (!has(save_.accepted, courseId)) {
      dialog(prof, lines(prof.id, "quest"));
      questCard(c);
      save_.accepted.push_back(courseId);
    } else {
      dialog(prof, {oneLine(prof.id, "tip")});
    }
    persist();
    while (!save_.results.count(courseId)) {
      const auto it = save_.progress.find(courseId);
      const int stage = it == save_.progress.end() ? 0 : static_cast<int>(it->second.size());
      const StageResult r = playStage(c, stage);
      if (r.score < 0) return;  // left the room
      if (!stageResults(c, stage, r)) return;
      persist();
    }
  }

  // ---------------------------------------------------------------- the arena

  struct Toast { std::string text; int tone = 0; double until = 0; };

  StageResult playStage(const Course& c, int stage) {
    const Professor& prof = data_.professor(c.professor);
    ArenaConfig cfg;
    cfg.courseId = c.id;
    cfg.stageIndex = stage;
    cfg.upgrades = save_.upgrades;
    cfg.firstCoffee = save_.firstCoffee;
    cfg.maccoffee = save_.maccoffee;
    cfg.nescafe = save_.nescafe;
    cfg.seed = rng_.next() | 1u;
    ArenaSim sim(data_, cfg);
    // Sprite sizes (pixels) of the web version's paper drawings, used for hit radii.
    const std::map<std::string, std::pair<int, int>> sizes = {
        {"quiz", {10, 12}}, {"homework", {14, 16}}, {"lab_report", {17, 19}}, {"loose_page", {10, 12}}, {"project", {19, 21}}, {"group_project", {28, 28}}};
    for (const auto& [k, wh] : sizes) sim.setSpriteSize(k, wh.first, wh.second);
    sim.invulnerable = false;

    Toast toast{text_.t("questCard.components." + sim.stage().type) + " · " + std::to_string(sim.stage().weight) + "%", ToneAccent, 2.5};
    if (sim.eightAm()) toast = {text_.t("ui.eightAm"), ToneCyan, 3};
    std::string bark;
    double barkUntil = 0;
    double holdX = 0, holdY = 0, holdXUntil = 0, holdYUntil = 0;
    const double frame = 1.0 / 30;
    double t = 0;
    term::clear();
    term::hideCursor(true);
    auto last = std::chrono::steady_clock::now();
    while (!sim.ended()) {
      ArenaInput in;
      in.autoAim = true;  // semicolons fire at the nearest paper, like the phone version
      if (bot_) {
        const double a = t / 1.4;
        in.moveX = (std::sin(a) >= 0 ? 1 : -1) * 0.8;
        in.moveY = std::cos(a * 3) * 0.3;
        sim.invulnerable = true;
        sim.autoSubmit = true;
      } else {
        // Terminals send key repeats rather than "held" state, so each press holds a direction briefly.
        for (int k = term::readKey(); k >= 0; k = term::readKey()) {
          switch (k) {
            case 'a': case 'A': case 1000 + 'D': holdX = -1; holdXUntil = t + 0.45; break;
            case 'd': case 'D': case 1000 + 'C': holdX = 1; holdXUntil = t + 0.45; break;
            case 'w': case 'W': case 1000 + 'A': holdY = -1; holdYUntil = t + 0.45; break;
            case 's': case 'S': case 1000 + 'B': holdY = 1; holdYUntil = t + 0.45; break;
            case ' ': in.dash = true; break;
            case 'q': case 'Q': in.coffee = true; break;
            case 'h': case 'H': in.help = true; break;
            case 'r': case 'R': in.reload = true; break;
            case 'x': case 'X': case 27: {
              term::hideCursor(false);
              StageResult left;
              left.score = -1;  // left the room: nothing recorded
              return left;
            }
            default: break;
          }
        }
        const double mx = t < holdXUntil ? holdX : 0, my = t < holdYUntil ? holdY : 0;
        const double len = std::hypot(mx, my);
        in.moveX = len > 0 ? mx / len : 0;
        in.moveY = len > 0 ? my / len : 0;
      }
      sim.step(frame / 2, in);
      ArenaInput keepMoving;
      keepMoving.autoAim = true;
      keepMoving.moveX = in.moveX;
      keepMoving.moveY = in.moveY;
      sim.step(frame / 2, keepMoving);
      t += frame;
      for (const Event& e : sim.takeEvents()) {
        if (e.type == Ev::Toast) {
          toast = {text_.t(e.key, {{"n", fmtNum(e.a)}, {"total", fmtNum(e.b)}}), e.tone, t + 2.2};
        } else if (e.type == Ev::Bark) {
          const Line l = oneLine(prof.id, e.key);
          countTics(l, prof);
          bark = std::string(col::yellow) + prof.displayName + col::reset + ": " + formatLine(l);
          barkUntil = t + 3.5;
        } else if (e.type == Ev::Cleared) {
          toast = {text_.t(e.a > 0 ? "ui.portalDown" : "ui.stageCleared") + "  ↑ " + text_.t("ui.submit"), e.a > 0 ? ToneRed : ToneGreen, t + 4};
        }
      }
      if (!bot_ || static_cast<int>(t * 30) % 15 == 0) render(sim, c, toast.until > t ? toast : Toast{}, barkUntil > t ? bark : std::string());
      // Real-time pacing (the bot runs fast).
      if (!bot_) {
        const auto next = last + std::chrono::milliseconds(33);
        std::this_thread::sleep_until(next);
        last = std::max(next, std::chrono::steady_clock::now() - std::chrono::milliseconds(100));
      }
    }
    save_.maccoffee = sim.maccoffee();
    save_.nescafe = sim.nescafe();
    if (sim.firstCoffeeTaken()) save_.firstCoffee = true;
    term::hideCursor(false);
    term::sleepMs(bot_ ? 50 : 700);
    return sim.result();
  }

  void render(const ArenaSim& sim, const Course& c, const Toast& toast, const std::string& bark) const {
    constexpr int W = 76, H = 19;
    const Rect& b = sim.bounds();
    const double cw = b.w / W, ch = b.h / H;
    struct Cell { std::string glyph = " "; const char* fg = col::gray; const char* bg = ""; };
    std::vector<Cell> grid(static_cast<size_t>(W * H));
    auto put = [&](double x, double y, const std::string& g, const char* fg, const char* bg = "") {
      const int cx = static_cast<int>((x - b.x) / cw), cy = static_cast<int>((y - b.y) / ch);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
      grid[static_cast<size_t>(cy * W + cx)] = {g, fg, bg};
    };
    // Floor dots and desks.
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) if ((x * 7 + y * 13) % 17 == 0) grid[static_cast<size_t>(y * W + x)] = {"·", col::gray, ""};
    for (const Rect& d : sim.desks())
      for (double y = d.y + ch / 2; y < d.y + d.h; y += ch)
        for (double x = d.x + cw / 2; x < d.x + d.w; x += cw) put(x, y, "▒", col::yellow);
    // Pickups, attendance, exit.
    for (const Pickup& p : sim.pickups()) {
      if (!p.active) continue;
      if (p.type == "maccoffee") put(p.x, p.y, "c", col::yellow);
      else if (p.type == "nescafe") put(p.x, p.y, "N", col::yellow);
      else if (p.type == "canteen_food") put(p.x, p.y, "%", col::green);
      else if (p.type == "deadline_extension") put(p.x, p.y, "+", col::cyan);
      else if (p.type == "feynman_lectures") put(p.x, p.y, "B", col::red);
    }
    if (sim.attendanceActive()) put(sim.attendanceX(), sim.attendanceY(), "&", col::magenta);
    if (sim.hasExit()) {
      const std::string label = sim.exitLocked() ? "[503]" : "[SUBMIT]";
      for (size_t i = 0; i < label.size(); i++) put(sim.exitX() + (static_cast<double>(i) - label.size() / 2.0) * cw, sim.exitY() + ch, std::string(1, label[i]), sim.exitLocked() ? col::red : col::cyan);
    }
    // Papers.
    for (const Paper& p : sim.papers()) {
      if (!p.active) continue;
      const std::string& kind = sim.kindName(p.kind);
      std::string g = kind == "quiz" ? "q" : kind == "homework" ? "h" : kind == "lab_report" ? "L" : kind == "loose_page" ? "~" : kind == "project" ? "P" : kind == "group_project" ? "G" : "?";
      const char* fg = p.spawnT > 0 ? col::gray : p.flash > 0 ? col::red : p.soggy > 0 ? col::yellow : col::white;
      put(p.x, p.y, g, fg);
    }
    // Boss: a block of letters with its name.
    const Boss& boss = sim.boss();
    if (boss.alive) {
      const bool fin = boss.kind == "final_exam";
      const std::string g = fin ? "F" : boss.state == "warn" || boss.state == "dive" ? "V" : "M";
      const int rw = fin ? 3 : 2, rh = fin ? 2 : 1;
      const char* fg = boss.flash > 0 ? col::red : boss.phase == 3 ? col::magenta : col::white;
      for (int dy = -rh; dy <= rh; dy++) for (int dx = -rw; dx <= rw; dx++) put(boss.x + dx * cw, boss.y + dy * ch, g, fg, col::bgGray);
      if (boss.state == "warn") put(boss.tx, boss.ty + 8, "X", col::red);
    }
    // Shots and coffee.
    for (const Shot& s : sim.shots()) if (s.active) put(s.x, s.y, ";", col::cyan);
    static const char* eglyph[] = {"-", "*", "A", "B", "C", "D"};
    for (const Shot& s : sim.enemyShots()) if (s.active) put(s.x, s.y, eglyph[std::min(5, std::max(0, s.tex))], col::red);
    for (const Cup& cp : sim.cups()) {
      const double k = std::min(1.0, cp.t / 0.45);
      put(cp.sx + (cp.tx - cp.sx) * k, cp.sy + (cp.ty - cp.sy) * k, "o", col::yellow);
    }
    // Player.
    const PlayerState& pl = sim.player();
    const bool blink = pl.invuln > 0 && static_cast<int>(pl.invuln * 20) % 2;
    put(pl.x, pl.y - 6, blink ? "o" : "@", col::cyan);
    // Deadline wall.
    const int wallCols = static_cast<int>((sim.wallX() - b.x) / cw);
    for (int y = 0; y < H; y++)
      for (int x = 0; x < std::min(W, wallCols); x++) {
        Cell& cell = grid[static_cast<size_t>(y * W + x)];
        cell.bg = sim.frozen() ? col::bgBlue : col::bgRed;
        if (x == wallCols - 1 && y == H / 2) { cell.glyph = "|"; cell.fg = col::white; }
      }

    // HUD.
    std::string out = "\x1b[H";
    const double sf = sim.sanity() / sim.sanityMax();
    const int bars = static_cast<int>(std::round(sf * 20));
    const double dl = std::max(0.0, sim.deadline());
    char clock[16];
    std::snprintf(clock, sizeof clock, "%d:%02d", static_cast<int>(dl) / 60, static_cast<int>(dl) % 60);
    out += std::string(col::gray) + c.id + ".cpp  " + col::reset;
    out += text_.t("ui.sanity") + " [" + (sf > 0.5 ? col::green : sf > 0.25 ? col::yellow : col::red) + std::string(static_cast<size_t>(bars), '#') + col::gray + std::string(static_cast<size_t>(20 - bars), '-') + col::reset + "] " + fmtNum(sim.sanity());
    out += "   " + std::string(sim.late() ? col::red : sim.frozen() ? col::cyan : dl < 10 ? col::red : col::white) + col::bold;
    out += sim.late() ? text_.t("ui.deadlinePassed") : (sim.frozen() ? text_.t("ui.frozen") + " " : text_.t("ui.deadline") + " ") + clock;
    out += std::string(col::reset) + "   " + col::yellow + text_.t("questCard.components." + sim.stage().type) + " " + std::to_string(sim.stage().weight) + "%" + col::reset + "\x1b[K\n";
    if (boss.alive) {
      const int hb = static_cast<int>(std::round(boss.hp / boss.maxHp * 40));
      out += std::string(col::red) + text_.t("enemies." + boss.kind) + " [" + std::string(static_cast<size_t>(hb), '=') + std::string(static_cast<size_t>(40 - hb), ' ') + "]" + col::reset;
    }
    out += "\x1b[K\n";
    out += std::string(col::gray) + "+" + std::string(W, '-') + "+" + col::reset + "\x1b[K\n";
    for (int y = 0; y < H; y++) {
      out += std::string(col::gray) + "|" + col::reset;
      for (int x = 0; x < W; x++) {
        const Cell& cell = grid[static_cast<size_t>(y * W + x)];
        out += cell.bg;
        out += cell.fg;
        out += cell.glyph;
        out += col::reset;
      }
      out += std::string(col::gray) + "|" + col::reset + "\x1b[K\n";
    }
    out += std::string(col::gray) + "+" + std::string(W, '-') + "+" + col::reset + "\x1b[K\n";
    out += sim.reloading() ? std::string(col::yellow) + text_.t("ui.compiling") + col::reset : "; " + std::to_string(sim.clip()) + "/" + std::to_string(sim.clipMax());
    out += "   MacCoffee " + std::to_string(sim.maccoffee()) + "  Nescafe " + std::to_string(sim.nescafe());
    out += "   " + std::string(sim.assistUsed() ? col::gray : col::green) + "[H] " + text_.t("ui.callProfessor") + col::reset;
    if (sim.shield() > 0) out += std::string("   ") + col::red + "Feynman" + col::reset;
    out += std::string("   ") + col::gray + "[X] " + text_.t("ui.backToCampus") + col::reset + "\x1b[K\n";
    out += toast.text.empty() ? std::string() : std::string(col::tone(toast.tone)) + col::bold + toast.text + col::reset;
    out += "\x1b[K\n";
    out += bark + "\x1b[K";
    term::write(out);
  }

  // ---------------------------------------------------------------- results

  // Returns false if the player wants to go back to the menu.
  bool stageResults(const Course& c, int stage, const StageResult& r) {
    const Professor& prof = data_.professor(c.professor);
    term::clear();
    term::write(std::string("\n  ") + col::gray + c.name + " — " + text_.t("questCard.components." + c.components[static_cast<size_t>(stage)].type) + " (" + std::to_string(c.components[static_cast<size_t>(stage)].weight) + "%)" + col::reset + "\n\n");
    const std::string head = r.cleared ? text_.t("ui.submitted") : r.mercy ? text_.t("ui.mercyPass") : text_.t("ui.retake");
    term::write(std::string("  ") + col::bold + (r.cleared ? col::green : r.mercy ? col::yellow : col::red) + head + col::reset + "\n\n");
    // Every part of the stage score, so the total visibly adds up.
    auto row = [&](const std::string& label, const std::string& pts, bool bold = false) {
      std::string l = label;
      l.resize(std::max<size_t>(l.size(), 30), ' ');  // pad before adding colour codes, so columns line up
      term::write(std::string("  ") + (bold ? col::bold : "") + l + col::yellow + pts + col::reset + "\n");
    };
    if (r.cleared) {
      const Json& sc = data_.balance()["scoring"];
      const int onTime = r.late ? 0 : sc["onTimeBonus"].integer(10);
      const int attendance = r.attendanceMissed ? data_.balance()["hazards"]["attendance_sheet"]["penaltyIfMissed"].integer(5) : 0;
      row(text_.t("ui.clearedPts"), std::to_string(sc["cleared"].integer(70)));
      row(text_.t("ui.sanityBonus", {{"n", std::to_string(r.sanityLeft)}}), "+" + std::to_string(r.score - sc["cleared"].integer(70) - onTime + attendance));
      row(r.late ? text_.t("ui.late") : text_.t("ui.onTime"), "+" + std::to_string(onTime));
      if (attendance) row(text_.t("ui.attendanceMissedShort"), "-" + std::to_string(attendance));
    } else {
      row(text_.t("ui.destroyedPct", {{"n", fmtNum(r.destroyedFraction * 100)}}), r.mercy || r.retake ? "" : "+" + std::to_string(r.score));
    }
    if (!r.retake) row(text_.t("ui.stageScore"), std::to_string(r.score) + "/100", true);
    const Line l = oneLine(prof.id, r.cleared ? "win" : "fail");
    countTics(l, prof);
    term::write(std::string("\n  ") + col::yellow + prof.displayName + col::reset + ": " + formatLine(l) + "\n");
    if (!r.achievement.empty() && !has(save_.achievements, r.achievement)) {
      save_.achievements.push_back(r.achievement);
      term::write(std::string("\n  ") + col::yellow + "★ " + text_.t("ui.achievement", {{"name", text_.t("achievements." + r.achievement)}}) + col::reset + "\n");
    }

    if (r.retake) {
      term::write(std::string("\n  ") + col::bold + "Enter" + col::reset + ": " + text_.t("ui.retry") + "    " + col::bold + "X" + col::reset + ": " + text_.t("ui.backToCampus") + "\n");
      const int k = term::waitKey(bot_);
      return !(k == 'x' || k == 'X' || k == 27);
    }

    auto& prog = save_.progress[c.id];
    prog.push_back(r.score);
    if (r.cleared) save_.wins[c.id]++;
    if (prog.size() < c.components.size()) {
      term::write(std::string("\n  ") + col::bold + "Enter" + col::reset + ": " + text_.t("ui.continueStage") + "    " + col::bold + "X" + col::reset + ": " + text_.t("ui.backToCampus") + "\n");
      const int k = term::waitKey(bot_);
      return !(k == 'x' || k == 'X' || k == 27);
    }

    // Course complete.
    const double percent = coursePercent(data_, c.id, prog);
    const Letter letter = letterFor(data_, percent);
    const int won = save_.wins[c.id];
    save_.results[c.id] = {percent, letter.letter, letter.points, hasMercyPass(data_, c.id) && won < static_cast<int>(prog.size())};
    const int earned = creditsFor(data_, percent);
    save_.credits += earned;
    save_.progress.erase(c.id);
    if (prof.achievementId == "curved" && won == 0 && percent >= 60 && !has(save_.achievements, "curved")) {
      save_.achievements.push_back("curved");
      term::write(std::string("\n  ") + col::yellow + "★ " + text_.t("ui.achievement", {{"name", text_.t("achievements.curved")}}) + col::reset + "\n");
    }
    term::write(std::string("\n  ") + col::bold + col::yellow + text_.t("ui.courseComplete") + ": " + fmtNum(percent, 1) + "% · " + letter.letter + col::reset + "\n");
    term::write(std::string("  ") + col::green + text_.t("ui.creditsEarned", {{"n", std::to_string(earned)}}) + col::reset + "\n");
    shop();
    return true;
  }

  void shop() {
    const auto& ups = data_.balance()["upgrades"].elements();
    for (;;) {
      term::write(std::string("\n  ") + col::bold + text_.t("ui.shop") + col::reset + col::gray + "  (" + text_.t("ui.credits") + ": " + std::to_string(save_.credits) + ")" + col::reset + "\n");
      for (size_t i = 0; i < ups.size(); i++) {
        const Json& u = ups[i];
        const bool owned = has(save_.upgrades, u["id"].str());
        term::write("  " + std::to_string(i + 1) + ") " + u["name"].str() + col::gray + "  " + u["effect"].str() + col::reset + "  " +
                    (owned ? std::string(col::green) + text_.t("ui.owned") + col::reset : std::to_string(u["cost"].integer())) + "\n");
      }
      term::write(std::string("  ") + col::bold + "Enter" + col::reset + ": " + text_.t("ui.backToCampus") + "\n");
      const int k = term::waitKey(bot_, 400);
      const int i = k - '1';
      if (i < 0 || i >= static_cast<int>(ups.size())) return;
      const Json& u = ups[static_cast<size_t>(i)];
      if (has(save_.upgrades, u["id"].str())) continue;
      if (save_.credits < u["cost"].integer()) { term::write(std::string("  ") + col::red + text_.t("ui.notEnough") + col::reset + "\n"); continue; }
      save_.credits -= u["cost"].integer();
      save_.upgrades.push_back(u["id"].str());
    }
  }

  void transcript() {
    term::clear();
    term::write(std::string("\n  ") + col::bgBlue + col::white + col::bold + " " + text_.t("ui.title") + " · " + text_.t("ui.transcript") + " " + col::reset + "\n\n");
    std::vector<double> points;
    for (const auto& id : data_.semesterOrder()) {
      const Course& c = data_.course(id);
      const auto it = save_.results.find(id);
      std::string name = c.name;
      name.resize(std::max<size_t>(name.size(), 26), ' ');
      std::string prof = data_.professor(c.professor).displayName;
      prof.resize(std::max<size_t>(prof.size(), 24), ' ');
      if (it == save_.results.end()) { term::write("  " + name + prof + "—\n"); continue; }
      points.push_back(it->second.points);
      term::write("  " + name + col::gray + prof + col::reset + fmtNum(it->second.percent, 1) + "%  " + col::bold + (it->second.points >= 3 ? col::green : col::red) + it->second.letter + (it->second.mercy ? "*" : "") + col::reset + "  " + fmtNum(it->second.points, 1) + "\n");
    }
    term::write(std::string("\n  ") + col::bold + col::blue + text_.t("ui.gpa") + ": " + fmtNum(gpa(points), 2) + col::reset + "\n");
    for (const auto& a : save_.achievements) term::write(std::string("  ") + col::yellow + "★ " + text_.t("achievements." + a) + col::reset + "\n");
    term::write(std::string("\n  ") + col::gray + text_.t("ui.semesterDone") + col::reset + "\n");
    if (bot_) { std::printf("\nBOT GPA %.2f\n", gpa(points)); return; }
    term::write(std::string("  ") + col::bold + "N" + col::reset + ": " + text_.t("ui.playAgain") + "    Enter: menu\n");
    const int k = term::waitKey(false);
    if (k == 'n' || k == 'N') {
      SaveData fresh;
      fresh.lang = save_.lang; fresh.credits = save_.credits; fresh.upgrades = save_.upgrades;
      fresh.achievements = save_.achievements; fresh.ticCount = save_.ticCount;
      save_ = fresh;
      persist();
    }
  }
};

int main(int argc, char** argv) {
  bool bot = false, reset = false;
  std::string lang;
  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i];
    if (a == "--bot") bot = true;
    else if (a == "--reset") reset = true;
    else if (a == "--lang" && i + 1 < argc) lang = argv[++i];
    else if (a == "--help" || a == "-h") {
      std::printf("CAU: Semester Survivor (terminal edition)\n  --lang en|ru|uz   --reset   --bot\n");
      return 0;
    }
  }
  int cols = 80, rows = 30;
  if (!bot && term::size(cols, rows) && (cols < 78 || rows < 26))
    std::printf("Tip: make the terminal at least 78x26 (it is %dx%d) so the arena fits.\nPress Enter to continue...\n", cols, rows), std::getchar();
  term::enableRaw();
  std::atexit([] { term::restore(); term::write("\x1b[0m\x1b[?25h\n"); });
  try {
    Game game(bot, lang, reset);
    return game.run();
  } catch (const std::exception& e) {
    term::restore();
    std::fprintf(stderr, "error: %s\n", e.what());
    return 1;
  }
}
