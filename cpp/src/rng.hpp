// Small deterministic random generator (xorshift32). Seeded from JS in the browser,
// fixed in native tests, so a whole fight can be replayed exactly.
#pragma once
#include <cstdint>

namespace cau {

class Rng {
 public:
  explicit Rng(uint32_t seed = 0x9E3779B9u) { reseed(seed); }
  void reseed(uint32_t seed) { state_ = seed ? seed : 0x9E3779B9u; }
  uint32_t next() {
    state_ ^= state_ << 13;
    state_ ^= state_ >> 17;
    state_ ^= state_ << 5;
    return state_;
  }
  // [0, 1)
  double uniform() { return (next() >> 8) * (1.0 / 16777216.0); }
  double range(double lo, double hi) { return lo + (hi - lo) * uniform(); }
  int between(int lo, int hi) { return lo + static_cast<int>(uniform() * (hi - lo + 1)); }  // inclusive

 private:
  uint32_t state_;
};

}  // namespace cau
