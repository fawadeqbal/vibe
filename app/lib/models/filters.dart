import 'discover.dart';

export 'discover.dart' show FilterAccess, WantedGender;

/// Who you meet: one set for random matches and Discover, saved on your
/// account (the web's stores/filters.ts). Age and verified only are free;
/// gender and a country need VIP, Vibe Hour or the filter pass.
class SharedFilters {
  const SharedFilters({this.gender = WantedGender.anyone, this.minAge = 18, this.maxAge = 99, this.countryCode, this.verifiedOnly = false});
  final WantedGender gender;
  final int minAge;
  final int maxAge;

  /// null = anywhere.
  final String? countryCode;
  final bool verifiedOnly;

  static const defaults = SharedFilters();

  /// Gender or a country: the filters that need VIP, Vibe Hour or a pass.
  bool get usesExtra => gender != WantedGender.anyone || countryCode != null;

  /// Anything other than the defaults.
  bool get anyOn => usesExtra || verifiedOnly || minAge != 18 || maxAge != 99;

  /// The free part (age, verified only).
  SharedFilters freeOnly() => SharedFilters(minAge: minAge, maxAge: maxAge, verifiedOnly: verifiedOnly);

  /// "Any age", "20–30", "25+".
  String get ageLabel => minAge == 18 && maxAge >= 99 ? 'Any age' : (maxAge >= 99 ? '$minAge+' : '$minAge–$maxAge');

  SharedFilters copyWith({WantedGender? gender, int? minAge, int? maxAge, String? countryCode, bool clearCountry = false, bool? verifiedOnly}) => SharedFilters(
        gender: gender ?? this.gender,
        minAge: minAge ?? this.minAge,
        maxAge: maxAge ?? this.maxAge,
        countryCode: clearCountry ? null : (countryCode ?? this.countryCode),
        verifiedOnly: verifiedOnly ?? this.verifiedOnly,
      );

  Map<String, dynamic> toJson() => {'gender': gender.name, 'minAge': minAge, 'maxAge': maxAge, 'countryCode': countryCode, 'verifiedOnly': verifiedOnly};

  factory SharedFilters.fromJson(Map<String, dynamic> m) {
    int age(Object? v, int d) => v is num ? v.round().clamp(18, 99) : d;
    final min = age(m['minAge'], 18);
    final code = m['countryCode'];
    return SharedFilters(
      gender: switch (m['gender']) {
        'women' => WantedGender.women,
        'men' => WantedGender.men,
        _ => WantedGender.anyone,
      },
      minAge: min,
      maxAge: age(m['maxAge'], 99) < min ? min : age(m['maxAge'], 99),
      countryCode: code is String && RegExp(r'^[A-Z]{2}$').hasMatch(code) ? code : null,
      verifiedOnly: m['verifiedOnly'] == true,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SharedFilters && other.gender == gender && other.minAge == minAge && other.maxAge == maxAge && other.countryCode == countryCode && other.verifiedOnly == verifiedOnly;

  @override
  int get hashCode => Object.hash(gender, minAge, maxAge, countryCode, verifiedOnly);
}

FilterAccess filterAccessFromJson(Map<String, dynamic> m) {
  final r = m['reason'];
  return FilterAccess(
    unlocked: m['unlocked'] == true,
    reason: r is String && const ['free', 'vip', 'vibe_hour', 'pass'].contains(r) ? r : null,
    passUntil: m['passUntil'] is String ? DateTime.tryParse(m['passUntil'] as String)?.toLocal() : null,
    passCost: m['passCost'] is num ? (m['passCost'] as num).toInt() : 25,
    passHours: m['passHours'] is num ? (m['passHours'] as num).toInt() : 24,
  );
}
