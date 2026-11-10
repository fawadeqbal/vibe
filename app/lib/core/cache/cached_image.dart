import 'dart:io' show Platform;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

/// Photos (avatars, Discover cards, chat photos) kept on the phone: shown at
/// once next time instead of downloaded again, and still there on a weak
/// connection. Flutter tests (no disk plugins) use plain network images.
ImageProvider netImage(String url) => _inTests ? NetworkImage(url) : CachedNetworkImageProvider(url);

final bool _inTests = Platform.environment.containsKey('FLUTTER_TEST');
