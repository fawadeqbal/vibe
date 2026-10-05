import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../services/payments/payment_links.dart';

/// Opens the provider's hosted payment page.
/// * GET pages (card gateway) open in the in-app browser (Custom Tab /
///   SFSafariViewController); the page ends at `vibe://payment-return…`,
///   which the OS hands back to the app as a deep link.
/// * POST pages (JazzCash hosted checkout) need a form post, which a browser
///   URL can't carry: a WebView page posts the form and closes itself when
///   the page navigates to `vibe://payment-return…`.
class HostedPayments {
  const HostedPayments();

  Future<bool> openGet(String url) async {
    final uri = Uri.parse(url);
    try {
      if (await launchUrl(uri, mode: LaunchMode.inAppBrowserView)) return true;
    } catch (_) {}
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  /// Dismisses the in-app browser where the platform allows it (iOS).
  Future<void> closeBrowser() async {
    try {
      if (await supportsCloseForLaunchMode(LaunchMode.inAppBrowserView)) await closeInAppWebView();
    } catch (_) {}
  }

  /// Null when the person closed the page without finishing.
  Future<PaymentReturn?> openPost(BuildContext context, String url, Map<String, String> fields) {
    return Navigator.of(context).push<PaymentReturn>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => HostedFormPage(url: url, fields: fields)));
  }
}

/// An HTML page that immediately form-POSTs [fields] to [url].
String autoSubmitFormHtml(String url, Map<String, String> fields) {
  String esc(String s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
  final inputs = fields.entries.map((e) => '<input type="hidden" name="${esc(e.key)}" value="${esc(e.value)}">').join();
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      '<body style="background:#0B0A10;color:#B9B3C9;font-family:sans-serif;text-align:center;padding-top:40vh">'
      'Opening the payment page…<form id="f" method="post" action="${esc(url)}">$inputs</form>'
      '<script>document.getElementById("f").submit();</script></body></html>';
}

/// Full-screen WebView for a form-POST hosted payment page.
class HostedFormPage extends StatefulWidget {
  const HostedFormPage({super.key, required this.url, required this.fields});
  final String url;
  final Map<String, String> fields;

  @override
  State<HostedFormPage> createState() => _HostedFormPageState();
}

class _HostedFormPageState extends State<HostedFormPage> {
  late final WebViewController _web;
  int _progress = 0;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(V.bg)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
        onNavigationRequest: (req) {
          final back = PaymentReturn.parse(Uri.parse(req.url));
          if (back != null) {
            _finish(back);
            return NavigationDecision.prevent;
          }
          // Bank 3-D Secure / wallet apps may hand off to another app.
          final uri = Uri.parse(req.url);
          if (uri.scheme != 'http' && uri.scheme != 'https' && uri.scheme != 'about' && uri.scheme != 'data') {
            unawaited(launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false));
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadHtmlString(autoSubmitFormHtml(widget.url, widget.fields), baseUrl: Uri.parse(widget.url).origin);
  }

  void _finish(PaymentReturn r) {
    if (_done) return;
    _done = true;
    Navigator.of(context).pop(r);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: vibeAppBar(context, 'Secure payment', actions: [
        IconButton(tooltip: 'Close', icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
      ]),
      body: Column(
        children: [
          if (_progress < 100) LinearProgressIndicator(value: _progress / 100, minHeight: 2, color: V.pink, backgroundColor: V.surface2),
          Expanded(child: WebViewWidget(controller: _web)),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.lock_rounded, size: 14, color: V.trust),
              const SizedBox(width: 6),
              Text('Your details go to the payment provider, not to Vibe.', style: VT.body(11.5, color: V.text2)),
            ]),
          ),
        ],
      ),
    );
  }
}
