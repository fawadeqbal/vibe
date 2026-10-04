import 'package:flutter/material.dart';

/// Vibe's visual world: near-black ground, one hot accent that runs
/// pink → violet, gold for money, teal for trust. Built for a phone held in
/// the dark at 11pm; every surface is a step lighter than the one under it.
///
/// Rules from the redesign:
/// * The gradient is reserved for the one primary action per screen.
/// * Teal means trust — verified, blur, safe mode, safety.
/// * Gold means money — coins, VIP, prices.
/// * Geist carries the UI; Instrument Serif italic marks a few emotional
///   words ("right now.", "for you", "VIP").
class V {
  V._();

  static const Color bg = Color(0xFF0B0A10);
  static const Color bg2 = Color(0xFF12101A);
  static const Color surface = Color(0xFF1A1724);
  static const Color surface2 = Color(0xFF241F31);
  static const Color surface3 = Color(0xFF2E2840);

  /// A selected tile (gift picked, segment on).
  static const Color surfaceSel = Color(0xFF2C2540);
  static const Color line = Color(0x14FFFFFF); // 8%
  static const Color lineSoft = Color(0x0FFFFFFF); // 6%
  static const Color lineStrong = Color(0x24FFFFFF); // 14%

  static const Color text = Color(0xFFF4F1FA);
  static const Color text2 = Color(0xFFB9B3C9);
  static const Color muted = Color(0xFF7F7893);

  static const Color pink = Color(0xFFFF3D8F);
  static const Color pinkSoft = Color(0xFFFF7AB3);
  static const Color violet = Color(0xFF8B5CF6);
  static const Color lavender = Color(0xFFC4B5FD);
  static const Color pinkDeep = Color(0xFFD62E76);
  static const Color gold = Color(0xFFFFC857);
  static const Color gem = Color(0xFF5EEAD4);
  static const Color ok = Color(0xFF34D399);
  static const Color bad = Color(0xFFFB7185);
  static const Color warn = Color(0xFFFBBF24);

  /// Text/icons that sit on gold or teal fills.
  static const Color onGold = Color(0xFF1A1200);
  static const Color onGoldIcon = Color(0xFF4A2E00);
  static const Color onGem = Color(0xFF062A26);

  /// Trust is teal; an alias so intent reads in the code.
  static const Color trust = gem;

  /// Frosted fill for anything floating over video.
  static const Color glass = Color(0x8012101A); // rgba(18,16,26,.5)

  static const LinearGradient brand = LinearGradient(colors: [pink, violet], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const LinearGradient brandSoft = LinearGradient(colors: [Color(0x33FF3D8F), Color(0x338B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const LinearGradient goldGrad = LinearGradient(colors: [Color(0xFFFFD98A), Color(0xFFF0A020)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const LinearGradient gemGrad = LinearGradient(colors: [Color(0xFF8CF5E4), Color(0xFF2DD4BF)], begin: Alignment.topLeft, end: Alignment.bottomRight);

  /// Premium cards (VIP banner, VIP row on Me).
  static const LinearGradient vipCard = LinearGradient(colors: [Color(0xFF241B33), Color(0xFF14111C)], begin: Alignment(-0.35, -1), end: Alignment(0.35, 1));

  static const double r = 22;
  static const double rSm = 12;
  static const double rLg = 32;

  static const String sans = 'Geist';
  static const String serif = 'InstrumentSerif';
  static const String monoFamily = 'GeistMono';

  static ThemeData theme() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: pink,
      onPrimary: Colors.white,
      secondary: violet,
      onSecondary: Colors.white,
      tertiary: gem,
      onTertiary: onGem,
      error: bad,
      onError: Colors.black,
      surface: surface,
      onSurface: text,
    );
    final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: bg, fontFamily: sans);
    return base.copyWith(
      textTheme: base.textTheme.apply(bodyColor: text, displayColor: text, fontFamily: sans),
      splashFactory: InkSparkle.splashFactory,
      dividerColor: lineSoft,
      dividerTheme: const DividerThemeData(color: lineSoft, thickness: 1, space: 1),
      bottomSheetTheme: const BottomSheetThemeData(backgroundColor: surface, surfaceTintColor: Colors.transparent, showDragHandle: false),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28), side: const BorderSide(color: line)),
        titleTextStyle: VT.title(20),
        contentTextStyle: VT.body(14, color: text2, height: 1.5),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: pinkSoft, textStyle: VT.label(14, weight: FontWeight.w600)),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: surface2,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: line)),
        textStyle: VT.body(14),
      ),
      listTileTheme: ListTileThemeData(iconColor: text2, textColor: text, titleTextStyle: VT.body(15)),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: pink),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surface3,
        contentTextStyle: VT.body(14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface2,
        hintStyle: VT.body(15, color: muted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: violet, width: 1.5)),
        prefixIconColor: text2,
      ),
      // Toggles in Vibe are almost all safety toggles: teal track, dark knob.
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? bg : text2),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? gem : surface3),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        surfaceTintColor: Colors.transparent,
        foregroundColor: text,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: VT.title(18),
      ),
    );
  }
}

/// Geist for everything; weight carries the hierarchy, tight negative
/// tracking on the big sizes. `serif` is the emotional accent.
class VT {
  VT._();

  static const _tabular = [FontFeature.tabularFigures()];

  /// Big headlines: 700 with tight tracking (38px → -1.5).
  static TextStyle display(double size, {Color color = V.text, double? height}) =>
      TextStyle(fontFamily: V.sans, fontSize: size, fontWeight: FontWeight.w700, letterSpacing: -0.038 * size, height: height ?? 1.04, color: color);

  static TextStyle title(double size, {Color color = V.text, FontWeight weight = FontWeight.w700, double? height}) =>
      TextStyle(fontFamily: V.sans, fontSize: size, fontWeight: weight, letterSpacing: size >= 20 ? -0.03 * size : -0.012 * size, height: height ?? 1.2, color: color);

  static TextStyle body(double size, {Color color = V.text, FontWeight weight = FontWeight.w400, double? height}) =>
      TextStyle(fontFamily: V.sans, fontSize: size, fontWeight: weight, height: height ?? 1.4, color: color);

  static TextStyle label(double size, {Color color = V.text2, FontWeight weight = FontWeight.w600, double letterSpacing = 0}) =>
      TextStyle(fontFamily: V.sans, fontSize: size, fontWeight: weight, letterSpacing: letterSpacing, height: 1.2, color: color);

  /// Numbers that change in place (balances, prices, counts).
  static TextStyle number(double size, {Color color = V.text, FontWeight weight = FontWeight.w700}) =>
      TextStyle(fontFamily: V.sans, fontSize: size, fontWeight: weight, letterSpacing: size >= 20 ? -0.03 * size : 0, height: 1.1, color: color, fontFeatures: _tabular);

  /// Section labels: "COINS", "SAFETY & TRUST".
  static TextStyle overline({Color color = V.muted}) =>
      TextStyle(fontFamily: V.sans, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1.3, height: 1.2, color: color);

  /// Instrument Serif italic — a few words per screen, never body copy.
  static TextStyle serif(double size, {Color color = V.text}) =>
      TextStyle(fontFamily: V.serif, fontStyle: FontStyle.italic, fontWeight: FontWeight.w400, fontSize: size, letterSpacing: -0.012 * size, height: 1.0, color: color);

  static TextStyle mono(double size, {Color color = V.text2, FontWeight weight = FontWeight.w500}) =>
      TextStyle(fontFamily: V.monoFamily, fontSize: size, fontWeight: weight, color: color, height: 1.3, fontFeatures: _tabular);
}
