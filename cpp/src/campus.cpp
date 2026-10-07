#include "campus.hpp"

#include <cmath>
#include <queue>
#include <unordered_map>

namespace cau {

void CampusMap::load(const GameData& d) {
  const Json& c = d.campus();
  w_ = c["size"][0].integer();
  h_ = c["size"][1].integer();
  grid_.clear();
  for (const Json& row : c["grid"].elements()) grid_.push_back(row.str());
  std::unordered_map<char, bool> legend;
  for (const auto& kv : c["legend"].items()) legend[kv.first.empty() ? ' ' : kv.first[0]] = kv.second["walkable"].boolean();

  walk_.assign(static_cast<size_t>(w_ * h_), false);
  blocked_.assign(static_cast<size_t>(w_ * h_), 1);
  for (int y = 0; y < h_; y++)
    for (int x = 0; x < w_; x++) {
      const bool ok = legend[at(x, y)];
      walk_[static_cast<size_t>(y * w_ + x)] = ok;
      blocked_[static_cast<size_t>(y * w_ + x)] = ok ? 0 : 1;
    }

  buildings_.assign(static_cast<size_t>(w_ * h_), -1);
  int bi = 0;
  for (const Json& b : c["buildings"].elements()) {
    std::vector<std::pair<int, int>> stack{{b["seed"][0].integer(), b["seed"][1].integer()}};
    while (!stack.empty()) {
      auto [x, y] = stack.back();
      stack.pop_back();
      if (x < 0 || y < 0 || x >= w_ || y >= h_) continue;
      const size_t i = static_cast<size_t>(y * w_ + x);
      const char ch = at(x, y);
      if (buildings_[i] != -1 || (ch != '#' && ch != 'a')) continue;
      buildings_[i] = bi;
      stack.push_back({x + 1, y});
      stack.push_back({x - 1, y});
      stack.push_back({x, y + 1});
      stack.push_back({x, y - 1});
    }
    bi++;
  }
}

char CampusMap::at(int x, int y) const {
  if (x < 0 || y < 0 || y >= h_ || x >= static_cast<int>(grid_[static_cast<size_t>(y)].size())) return '.';
  return grid_[static_cast<size_t>(y)][static_cast<size_t>(x)];
}

bool CampusMap::walkable(int x, int y) const {
  return x >= 0 && y >= 0 && x < w_ && y < h_ && walk_[static_cast<size_t>(y * w_ + x)];
}

std::vector<int> CampusMap::bfs(int sx, int sy) const {
  std::vector<int> dist(static_cast<size_t>(w_ * h_), -1);
  if (!walkable(sx, sy)) return dist;
  std::queue<int> q;
  dist[static_cast<size_t>(sy * w_ + sx)] = 0;
  q.push(sy * w_ + sx);
  const int dx[4] = {1, -1, 0, 0}, dy[4] = {0, 0, 1, -1};
  while (!q.empty()) {
    const int i = q.front();
    q.pop();
    const int x = i % w_, y = i / w_;
    for (int k = 0; k < 4; k++) {
      const int nx = x + dx[k], ny = y + dy[k];
      if (!walkable(nx, ny)) continue;
      const size_t ni = static_cast<size_t>(ny * w_ + nx);
      if (dist[ni] != -1) continue;
      dist[ni] = dist[static_cast<size_t>(i)] + 1;
      q.push(static_cast<int>(ni));
    }
  }
  return dist;
}

double CampusMap::walkTiles(int sx, int sy, int tx, int ty) const {
  std::vector<double> dist(static_cast<size_t>(w_ * h_), 1e18);
  using Node = std::pair<double, int>;
  std::priority_queue<Node, std::vector<Node>, std::greater<Node>> open;
  dist[static_cast<size_t>(sy * w_ + sx)] = 0;
  open.push({0, sy * w_ + sx});
  while (!open.empty()) {
    auto [d, i] = open.top();
    open.pop();
    const int x = i % w_, y = i / w_;
    if (x == tx && y == ty) return d;
    if (d > dist[static_cast<size_t>(i)]) continue;
    for (int ddx = -1; ddx <= 1; ddx++)
      for (int ddy = -1; ddy <= 1; ddy++) {
        if (!ddx && !ddy) continue;
        const int nx = x + ddx, ny = y + ddy;
        if (!walkable(nx, ny)) continue;
        if (ddx && ddy && !(walkable(x + ddx, y) && walkable(x, y + ddy))) continue;
        const double nd = d + (ddx && ddy ? std::sqrt(2.0) : 1.0);
        const size_t ni = static_cast<size_t>(ny * w_ + nx);
        if (nd < dist[ni]) { dist[ni] = nd; open.push({nd, static_cast<int>(ni)}); }
      }
  }
  return -1;
}

}  // namespace cau
