#include "data.hpp"

#include <algorithm>
#include <stdexcept>

namespace cau {

void GameData::load(const std::string& enemies, const std::string& courses, const std::string& professors,
                    const std::string& campus, const std::string& rooms) {
  balance_ = Json::parse(enemies);
  campus_ = Json::parse(campus);
  const Json c = Json::parse(courses);
  const Json p = Json::parse(professors);
  const Json r = Json::parse(rooms);

  enemies_.clear();
  enemyIndex_.clear();
  for (const auto& kv : balance_["enemies"].items()) {
    const Json& e = kv.second;
    EnemyDef d;
    d.id = kv.first;
    d.hp = e["hp"].num();
    d.speed = e["speed"].num();
    d.touchDamage = e["touchDamage"].num();
    d.behaviour = e["behaviour"].str();
    if (e.has("shot")) {
      d.shoots = true;
      d.shotDamage = e["shot"]["damage"].num();
      d.shotSpeed = e["shot"]["speed"].num();
      d.shotEvery = e["shot"]["everySeconds"].num(2);
    }
    if (e.has("onDeath")) {
      d.onDeathSpawn = e["onDeath"]["spawn"].str();
      d.onDeathCount = e["onDeath"]["count"].integer();
    }
    d.idleTeammates = e["idleTeammates"].integer();
    enemyIndex_[d.id] = static_cast<int>(enemies_.size());
    enemies_.push_back(d);
  }

  courses_.clear();
  for (const Json& e : c["courses"].elements()) {
    Course co;
    co.id = e["id"].str(); co.name = e["name"].str(); co.professor = e["professor"].str();
    co.arena = e["arena"].str(); co.skin = e["skin"].str(); co.shieldPickup = e["shieldPickup"].str("");
    for (const Json& comp : e["components"].elements()) co.components.push_back({comp["type"].str(), comp["weight"].integer()});
    courses_.push_back(co);
  }
  semesterOrder_.clear();
  for (const Json& s : c["semesterOrder"].elements()) semesterOrder_.push_back(s.str());
  bands_.clear();
  for (const Json& b : c["gradeScale"]["bands"].elements()) bands_.push_back({b["min"].num(), b["letter"].str(), b["points"].num()});
  std::stable_sort(bands_.begin(), bands_.end(), [](const GradeBand& a, const GradeBand& b) { return a.min > b.min; });

  professors_.clear();
  for (const Json& e : p["professors"].elements()) {
    Professor pr;
    pr.id = e["id"].str(); pr.displayName = e["displayName"].str(); pr.course = e["course"].str();
    pr.personalityRule = e["personalityRule"].str("none");
    if (e["tic"].isObject()) {
      pr.ticPhrase = e["tic"]["phrase"].str();
      pr.ticChance = e["tic"]["chance"].num();
      pr.ticMaxPerBox = e["tic"]["maxPerBox"].integer(1);
    }
    pr.assistId = e["assist"]["id"].str();
    pr.assistSeconds = e["assist"]["seconds"].num();
    pr.assistHeals = e["assist"]["heals"].num();
    pr.achievementId = e["achievement"]["id"].str();
    professors_.push_back(pr);
  }

  rooms_.clear();
  for (const Json& e : r.elements()) {
    Room rm;
    rm.id = e["id"].str(); rm.name = e["name"].str(); rm.floor = e["floor"].str();
    rm.width = e["size"][0].integer(30); rm.height = e["size"][1].integer(17);
    rm.startX = e["playerStart"][0].integer(); rm.startY = e["playerStart"][1].integer();
    for (const Json& s : e["spawns"].elements()) rm.spawns.emplace_back(s[0].integer(), s[1].integer());
    for (const Json& d : e["desks"].elements()) rm.desks.push_back({d[0].num(), d[1].num(), d[2].num(), d[3].num()});
    for (const Json& pk : e["pickups"].elements()) rm.pickups.push_back({pk["type"].str(), pk["at"][0].integer(), pk["at"][1].integer()});
    rooms_.push_back(rm);
  }
  loaded_ = true;
}

const EnemyDef& GameData::enemy(const std::string& id) const {
  auto it = enemyIndex_.find(id);
  if (it == enemyIndex_.end()) throw std::runtime_error("unknown enemy " + id);
  return enemies_[static_cast<size_t>(it->second)];
}

int GameData::enemyIndex(const std::string& id) const {
  auto it = enemyIndex_.find(id);
  return it == enemyIndex_.end() ? -1 : it->second;
}

const Course& GameData::course(const std::string& id) const {
  for (const auto& c : courses_) if (c.id == id) return c;
  throw std::runtime_error("unknown course " + id);
}

const Professor& GameData::professor(const std::string& id) const {
  for (const auto& p : professors_) if (p.id == id) return p;
  throw std::runtime_error("unknown professor " + id);
}

const Room& GameData::room(const std::string& id) const {
  for (const auto& r : rooms_) if (r.id == id) return r;
  throw std::runtime_error("unknown room " + id);
}

}  // namespace cau
