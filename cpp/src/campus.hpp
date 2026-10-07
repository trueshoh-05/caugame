// The campus map as data: which tiles block, which building each tile belongs to, and paths.
#pragma once
#include <string>
#include <vector>

#include "data.hpp"

namespace cau {

class CampusMap {
 public:
  void load(const GameData& d);
  int width() const { return w_; }
  int height() const { return h_; }
  char at(int x, int y) const;
  bool walkable(int x, int y) const;
  // 1 = blocked (only '#' and '.' per the legend), row-major.
  const std::vector<int>& blocked() const { return blocked_; }
  // Building index per tile (-1 = none), flood-filled from each building's seed tile.
  const std::vector<int>& buildings() const { return buildings_; }
  // 4-way BFS distance in tiles from (sx, sy); -1 where unreachable.
  std::vector<int> bfs(int sx, int sy) const;
  // Shortest 8-way walk (no corner cutting) in tiles; -1 if unreachable.
  double walkTiles(int sx, int sy, int tx, int ty) const;

 private:
  int w_ = 0, h_ = 0;
  std::vector<std::string> grid_;
  std::vector<bool> walk_;
  std::vector<int> blocked_, buildings_;
};

}  // namespace cau
