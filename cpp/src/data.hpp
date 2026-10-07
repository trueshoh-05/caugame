// Game data, read from the same JSON files the web game uses (src/data/*.json).
// Nothing here is hard-coded: balance, courses, professors, rooms and the map all come from data.
#pragma once
#include <string>
#include <unordered_map>
#include <vector>

#include "json.hpp"

namespace cau {

struct EnemyDef {
  std::string id;
  double hp = 0, speed = 0, touchDamage = 0;
  std::string behaviour;
  bool shoots = false;
  double shotDamage = 0, shotSpeed = 0, shotEvery = 0;
  std::string onDeathSpawn;
  int onDeathCount = 0;
  int idleTeammates = 0;
};

struct Component { std::string type; int weight = 0; };

struct Course {
  std::string id, name, professor, arena, skin, shieldPickup;
  std::vector<Component> components;
};

struct Professor {
  std::string id, displayName, course, personalityRule;
  std::string ticPhrase;
  double ticChance = 0;
  int ticMaxPerBox = 0;
  std::string assistId;
  double assistSeconds = 0, assistHeals = 0;
  std::string achievementId;
};

struct Rect { double x = 0, y = 0, w = 0, h = 0; };
struct RoomPickup { std::string type; int x = 0, y = 0; };

struct Room {
  std::string id, name, floor;
  int width = 30, height = 17;
  int startX = 15, startY = 13;
  std::vector<std::pair<int, int>> spawns;
  std::vector<Rect> desks;  // in tiles
  std::vector<RoomPickup> pickups;
};

struct GradeBand { double min = 0; std::string letter; double points = 0; };

class GameData {
 public:
  // Each argument is the text of the matching JSON file. rooms is a JSON array of room objects.
  void load(const std::string& enemies, const std::string& courses, const std::string& professors,
            const std::string& campus, const std::string& rooms);

  const Json& balance() const { return balance_; }
  const Json& campus() const { return campus_; }
  const EnemyDef& enemy(const std::string& id) const;
  bool hasEnemy(const std::string& id) const { return enemyIndex_.count(id) > 0; }
  const std::vector<EnemyDef>& enemies() const { return enemies_; }
  int enemyIndex(const std::string& id) const;
  const Course& course(const std::string& id) const;
  const std::vector<Course>& courses() const { return courses_; }
  const std::vector<std::string>& semesterOrder() const { return semesterOrder_; }
  const Professor& professor(const std::string& id) const;
  const Room& room(const std::string& id) const;
  const std::vector<GradeBand>& gradeBands() const { return bands_; }
  bool loaded() const { return loaded_; }

 private:
  bool loaded_ = false;
  Json balance_, campus_;
  std::vector<EnemyDef> enemies_;
  std::unordered_map<std::string, int> enemyIndex_;
  std::vector<Course> courses_;
  std::vector<std::string> semesterOrder_;
  std::vector<Professor> professors_;
  std::vector<Room> rooms_;
  std::vector<GradeBand> bands_;
};

}  // namespace cau
