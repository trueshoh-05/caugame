#include "json.hpp"

#include <cstdlib>
#include <stdexcept>

namespace cau {

namespace {
const Json& nullJson() { static const Json n; return n; }
const std::string& emptyString() { static const std::string s; return s; }
}  // namespace

class JsonParser {
 public:
  explicit JsonParser(const std::string& s) : s_(s) {}

  Json parseDocument() {
    Json v = value();
    ws();
    if (i_ != s_.size()) fail("trailing characters");
    return v;
  }

 private:
  const std::string& s_;
  size_t i_ = 0;

  [[noreturn]] void fail(const char* what) {
    throw std::runtime_error(std::string("JSON parse error at ") + std::to_string(i_) + ": " + what);
  }
  void ws() { while (i_ < s_.size() && (s_[i_] == ' ' || s_[i_] == '\n' || s_[i_] == '\r' || s_[i_] == '\t')) i_++; }
  char peek() { ws(); return i_ < s_.size() ? s_[i_] : '\0'; }
  void expect(char c) { if (peek() != c) fail("unexpected character"); i_++; }
  bool literal(const char* word) {
    size_t n = 0;
    while (word[n]) n++;
    if (s_.compare(i_, n, word) != 0) return false;
    i_ += n;
    return true;
  }

  Json value() {
    Json v;
    char c = peek();
    if (c == '{') {
      v.type_ = Json::Type::Object;
      i_++;
      if (peek() == '}') { i_++; return v; }
      for (;;) {
        if (peek() != '"') fail("expected key");
        std::string key = string();
        expect(':');
        v.object_.emplace_back(std::move(key), value());
        if (peek() == ',') { i_++; continue; }
        expect('}');
        return v;
      }
    }
    if (c == '[') {
      v.type_ = Json::Type::Array;
      i_++;
      if (peek() == ']') { i_++; return v; }
      for (;;) {
        v.array_.push_back(value());
        if (peek() == ',') { i_++; continue; }
        expect(']');
        return v;
      }
    }
    if (c == '"') { v.type_ = Json::Type::String; v.string_ = string(); return v; }
    if (literal("true")) { v.type_ = Json::Type::Bool; v.bool_ = true; return v; }
    if (literal("false")) { v.type_ = Json::Type::Bool; v.bool_ = false; return v; }
    if (literal("null")) return v;
    if (c == '-' || (c >= '0' && c <= '9')) {
      const char* start = s_.c_str() + i_;
      char* end = nullptr;
      v.type_ = Json::Type::Number;
      v.number_ = std::strtod(start, &end);
      if (end == start) fail("bad number");
      i_ += static_cast<size_t>(end - start);
      return v;
    }
    fail("unexpected value");
  }

  static void appendUtf8(std::string& out, unsigned cp) {
    if (cp < 0x80) out += static_cast<char>(cp);
    else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
  }

  unsigned hex4() {
    if (i_ + 4 > s_.size()) fail("bad \\u escape");
    unsigned v = static_cast<unsigned>(std::strtoul(s_.substr(i_, 4).c_str(), nullptr, 16));
    i_ += 4;
    return v;
  }

  std::string string() {
    expect('"');
    std::string out;
    while (i_ < s_.size() && s_[i_] != '"') {
      char c = s_[i_++];
      if (c != '\\') { out += c; continue; }
      if (i_ >= s_.size()) fail("bad escape");
      char e = s_[i_++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'u': {
          unsigned cp = hex4();
          if (cp >= 0xD800 && cp <= 0xDBFF && i_ + 1 < s_.size() && s_[i_] == '\\' && s_[i_ + 1] == 'u') {
            i_ += 2;
            unsigned lo = hex4();
            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
          }
          appendUtf8(out, cp);
          break;
        }
        default: out += e;  // \" \\ \/
      }
    }
    if (i_ >= s_.size()) fail("unterminated string");
    i_++;
    return out;
  }
};

Json Json::parse(const std::string& text) { return JsonParser(text).parseDocument(); }

const std::string& Json::str() const { return type_ == Type::String ? string_ : emptyString(); }

size_t Json::size() const {
  if (type_ == Type::Array) return array_.size();
  if (type_ == Type::Object) return object_.size();
  return 0;
}

bool Json::has(const std::string& key) const {
  if (type_ != Type::Object) return false;
  for (const auto& kv : object_) if (kv.first == key) return true;
  return false;
}

const Json& Json::operator[](const std::string& key) const {
  if (type_ == Type::Object) for (const auto& kv : object_) if (kv.first == key) return kv.second;
  return nullJson();
}

const Json& Json::operator[](size_t i) const {
  if (type_ == Type::Array && i < array_.size()) return array_[i];
  return nullJson();
}

const std::vector<std::pair<std::string, Json>>& Json::items() const {
  static const std::vector<std::pair<std::string, Json>> none;
  return type_ == Type::Object ? object_ : none;
}

const std::vector<Json>& Json::elements() const {
  static const std::vector<Json> none;
  return type_ == Type::Array ? array_ : none;
}

}  // namespace cau
