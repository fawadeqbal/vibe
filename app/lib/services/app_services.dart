import 'package:flutter/foundation.dart';

import '../core/config/integrations_config.dart';
import '../screens/store/hosted_payment.dart';
import 'ads/rewarded_ads.dart';
import 'auth/social_sign_in.dart';
import 'media/media_picker.dart';
import 'payments/payment_links.dart';
import 'payments/store_billing.dart';
import 'push/push_service.dart';

/// The third-party integrations, built once in `main.dart` and provided to
/// the widget tree. Each one is an interface with a real implementation
/// (switched on by its keys) and a stand-in, so screens never check keys
/// themselves and tests swap in fakes.
class AppServices {
  AppServices({
    required this.config,
    StoreBilling? billing,
    PaymentLinks? links,
    this.hosted = const HostedPayments(),
    SocialSignIn? social,
    RewardedAds? ads,
    PushService? push,
    MediaPicker? media,
    TargetPlatform? platform,
  })  : billing = billing ?? NoStoreBilling(),
        links = links ?? ManualPaymentLinks(),
        social = social ?? const NoSocialSignIn(),
        ads = ads ?? const NoRewardedAds(),
        push = push ?? NoPush(),
        media = media ?? const NoMediaPicker(),
        platform = platform ?? defaultTargetPlatform;

  /// Everything off: tests and the offline demo's defaults.
  factory AppServices.none() => AppServices(config: const IntegrationsConfig());

  final IntegrationsConfig config;
  final StoreBilling billing;
  final PaymentLinks links;
  final HostedPayments hosted;
  final SocialSignIn social;
  final RewardedAds ads;
  final PushService push;
  final MediaPicker media;
  final TargetPlatform platform;

  bool get android => platform == TargetPlatform.android;
  bool get ios => platform == TargetPlatform.iOS;
}
