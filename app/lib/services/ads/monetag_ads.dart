import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import 'rewarded_ads.dart';

/// Opens the ad page and returns what it reported (`rewarded`, `failed:…`),
/// or null when the person closed it. Swappable in tests.
typedef AdPageOpener = Future<String?> Function(BuildContext context, Uri url);

/// Monetag Rewarded Interstitial. Monetag has no app SDK for rewarded videos,
/// so the ad plays on the website's `/ad-frame` page in a full-screen WebView:
/// the server gives a one-off token (`POST /wallet/rewards/ad/start`), the page
/// shows the ad with it, and Monetag's postback to our server confirms the view.
class MonetagRewardedAds implements RewardedAds {
  MonetagRewardedAds({required this.frameUrl, required this.start, AdPageOpener? open}) : _open = open ?? openMonetagPage;

  /// `<WEB_APP_URL>/ad-frame`, from the server.
  final String frameUrl;

  /// Asks the server for the view's token.
  final Future<String> Function() start;
  final AdPageOpener _open;
  bool _showing = false;

  @override
  bool get available => true;

  @override
  Future<void> refresh() async {}

  @override
  Future<AdResult> show(BuildContext context, {required String userId}) async {
    if (_showing) return const AdResult(AdOutcome.dismissed);
    _showing = true;
    try {
      final String token;
      try {
        token = await start();
      } on ApiException catch (e) {
        return AdResult(AdOutcome.unavailable, message: e.message);
      }
      if (!context.mounted) return const AdResult(AdOutcome.dismissed);
      final result = await _open(context, Uri.parse(frameUrl).replace(queryParameters: {'t': token}));
      if (result == null) return const AdResult(AdOutcome.dismissed);
      if (result == 'rewarded') return AdResult(AdOutcome.rewarded, token: token);
      return const AdResult(AdOutcome.noFill, message: 'No video to show right now. Try again in a minute.');
    } catch (_) {
      return const AdResult(AdOutcome.noFill, message: 'No video to show right now. Try again in a minute.');
    } finally {
      _showing = false;
    }
  }
}

Future<String?> openMonetagPage(BuildContext context, Uri url) =>
    Navigator.of(context).push<String>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => MonetagAdPage(url: url)));

/// Full-screen WebView on the website's /ad-frame. Pops with the page's report.
class MonetagAdPage extends StatefulWidget {
  const MonetagAdPage({super.key, required this.url});
  final Uri url;

  @override
  State<MonetagAdPage> createState() => _MonetagAdPageState();
}

class _MonetagAdPageState extends State<MonetagAdPage> {
  late final WebViewController _web;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(V.bg)
      ..addJavaScriptChannel('VibeAds', onMessageReceived: (m) => _finish(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        // The ad's own frames load freely; a tap on the ad that would replace
        // this page opens in the browser instead.
        onNavigationRequest: (req) {
          final u = Uri.parse(req.url);
          if (!req.isMainFrame || u.host == widget.url.host || u.scheme == 'about') return NavigationDecision.navigate;
          if (u.scheme == 'http' || u.scheme == 'https') unawaited(launchUrl(u, mode: LaunchMode.externalApplication).catchError((_) => false));
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(widget.url);
  }

  void _finish(String result) {
    if (_done || !mounted) return;
    _done = true;
    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: V.bg,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: WebViewWidget(controller: _web)),
            Positioned(
              top: 8,
              left: 8,
              child: IconButton(
                tooltip: 'Close — no coins',
                icon: const Icon(Icons.close_rounded, color: Colors.white70),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
