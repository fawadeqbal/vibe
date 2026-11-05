import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../models/models.dart';

/// The icon for each "Here for" choice — the web's (forum, group_add,
/// favorite, explore), which it draws as Solar glyphs except explore.
IconData intentIcon(ProfileIntent i) => switch (i) {
  ProfileIntent.chat => SolarIconsBold.dialog2,
  ProfileIntent.friends => SolarIconsBold.userPlusRounded,
  ProfileIntent.dating => SolarIconsBold.heart,
  ProfileIntent.open => Icons.explore_rounded,
};
