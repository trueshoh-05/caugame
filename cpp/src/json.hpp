// Minimal JSON reader for the game's data files. No third-party code.
#pragma once
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace cau {

class Json {
 public:
  enum class Type { Null, Bool, Number, String, Array, Object };

  Json() = default;
  static Json parse(const std::string& text);  // throws std::runtime_error on bad input

  Type type() const { return type_; }
  bool isNull() const { return type_ == Type::Null; }
  bool isNumber() const { return type_ == Type::Number; }
  bool isString() const { return type_ == Type::String; }
  bool isArray() const { return type_ == Type::Array; }
  bool isObject() const { return type_ == Type::Object; }

  double num(double fallback = 0) const { return type_ == Type::Number ? number_ : fallback; }
  int integer(int fallback = 0) const { return type_ == Type::Number ? static_cast<int>(number_) : fallback; }
  bool boolean(bool fallback = false) const { return type_ == Type::Bool ? bool_ : fallback; }
  const std::string& str() const;
  std::string str(const std::string& fallback) const { return type_ == Type::String ? string_ : fallback; }

  size_t size() const;
  bool has(const std::string& key) const;
  // Missing keys / indices return a shared null value, so lookups can be chained safely.
  const Json& operator[](const std::string& key) const;
  const Json& operator[](size_t i) const;
  const Json& operator[](int i) const { return (*this)[static_cast<size_t>(i)]; }
  // Object entries in file order.
  const std::vector<std::pair<std::string, Json>>& items() const;
  const std::vector<Json>& elements() const;

 private:
  friend class JsonParser;
  Type type_ = Type::Null;
  bool bool_ = false;
  double number_ = 0;
  std::string string_;
  std::vector<Json> array_;
  std::vector<std::pair<std::string, Json>> object_;
};

}  // namespace cau
