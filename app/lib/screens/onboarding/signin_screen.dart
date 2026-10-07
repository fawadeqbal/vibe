import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_config.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/payments.dart';
import '../../providers/session_provider.dart';
import '../../services/app_services.dart';
import '../../services/auth/social_sign_in.dart';

/// E-mail first (we send a 4-digit code), social buttons under it. In the
/// offline mock any address and any 4-digit code sign you in.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  static final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _codeStep = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  /// Social buttons: what the server can verify AND this build can run.
  List<String> _providers = const [];
  String? _socialBusy;

  @override
  void initState() {
    super.initState();
    _loadProviders();
  }

  Future<void> _loadProviders() async {
    final session = context.read<SessionProvider>();
    final social = context.read<AppServices>().social;
    final server = await session.socialProviders();
    if (!mounted) return;
    // Offline demo: the mock signs straight in with any provider.
    setState(() => _providers = ApiConfig.enabled ? visibleProviders(server: server, social: social) : server);
  }

  String get _address => _email.text.trim().toLowerCase();

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (!_emailPattern.hasMatch(_address)) {
      setState(() => _error = 'Enter a valid e-mail address.');
      return;
    }
    setState(() => _error = null);
    try {
      await context.read<SessionProvider>().requestCode(_address);
      if (!mounted) return;
      setState(() => _codeStep = true);
      _startResendTimer(30);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      // "Wait 21s before asking for another code": still go to the code step.
      final wait = e.details['retryIn'];
      if (wait is int && _codeStep) _startResendTimer(wait);
    }
  }

  void _startResendTimer(int seconds) {
    _timer?.cancel();
    setState(() => _resendIn = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
      if (_resendIn == 0) t.cancel();
    });
  }

  Future<void> _verify() async {
    if (_code.text.trim().length != 4) {
      setState(() => _error = 'The code is 4 digits.');
      return;
    }
    setState(() => _error = null);
    await _guard(() => context.read<SessionProvider>().signIn(method: 'email', email: _address, code: _code.text.trim()));
  }

  Future<void> _social(String provider) async {
    final session = context.read<SessionProvider>();
    final social = context.read<AppServices>().social;
    setState(() {
      _error = null;
      _socialBusy = provider;
    });
    try {
      await _guard(() async {
        if (!ApiConfig.enabled) return session.signIn(method: provider);
        final credential = await social.signIn(provider);
        if (credential == null) return; // cancelled
        await session.signInWith(credential);
      });
    } on SocialSignInException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _socialBusy = null);
    }
  }

  Widget _socialButton(String provider, bool busy) {
    final social = context.read<AppServices>().social;
    final dev = ApiConfig.enabled && !social.canUse(provider);
    final icon = switch (provider) {
      'google' => Icons.g_mobiledata_rounded,
      'apple' => Icons.apple,
      'facebook' => Icons.facebook_rounded,
      _ => SolarIconsBold.login_2,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GhostButton(
        label: 'Continue with ${socialProviderLabel(provider)}${dev ? ' (dev)' : ''}',
        icon: icon,
        expand: true,
        trailing: _socialBusy == provider ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: V.text2)) : null,
        onTap: busy || _socialBusy != null ? null : () => _social(provider),
      ),
    );
  }

  /// Shows server errors (wrong code, rate limits, offline) under the field.
  Future<void> _guard(Future<void> Function() fn) async {
    try {
      await fn();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Align(alignment: Alignment.centerLeft, child: VibeLogo(size: 44, shadow: false)),
              const SizedBox(height: 28),
              _codeStep ? const Headline('Enter the ', accent: 'code', size: 34, accentColor: V.pinkSoft) : const Headline('Your ', accent: 'email', size: 34, accentColor: V.pinkSoft),
              const SizedBox(height: 8),
              Text(
                _codeStep
                    ? 'We emailed a 4-digit code to $_address. Not there in a minute? Check your spam folder.${ApiConfig.enabled ? '' : ' (Mock: any 4 digits work.)'}'
                    : "We'll email you a 4-digit code to sign in. Nobody on Vibe sees your address.",
                style: VT.body(15, color: V.text2, height: 1.5),
              ),
              const SizedBox(height: 28),
              if (!_codeStep)
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.none,
                  textInputAction: TextInputAction.send,
                  autofocus: true,
                  style: VT.title(18, weight: FontWeight.w600),
                  decoration: const InputDecoration(hintText: 'you@gmail.com', prefixIcon: Icon(SolarIconsOutline.letter, color: V.text2)),
                  onSubmitted: (_) => _sendCode(),
                )
              else
                TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  autofocus: true,
                  maxLength: 4,
                  textAlign: TextAlign.center,
                  style: VT.display(30),
                  decoration: const InputDecoration(hintText: '••••', counterText: ''),
                  onSubmitted: (_) => _verify(),
                ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: VT.body(13, color: V.bad)),
              ],
              const SizedBox(height: 20),
              GradientButton(label: _codeStep ? 'Verify and continue' : 'Send code', onTap: _codeStep ? _verify : _sendCode, busy: session.busy),
              if (_codeStep) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton(
                      onPressed: session.busy || _resendIn > 0 ? null : _sendCode,
                      child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend code', style: VT.label(14, color: _resendIn > 0 ? V.muted : V.pinkSoft)),
                    ),
                    Text('·', style: VT.label(14, color: V.muted)),
                    TextButton(
                      onPressed: () => setState(() {
                        _codeStep = false;
                        _code.clear();
                        _error = null;
                      }),
                      child: Text('Change email', style: VT.label(14, color: V.text2)),
                    ),
                  ],
                ),
              ],
              if (_providers.isNotEmpty) ...[
                const SizedBox(height: 28),
                Row(
                  children: [
                    const Expanded(child: Divider(color: V.line)),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('or', style: VT.label(12, color: V.muted))),
                    const Expanded(child: Divider(color: V.line)),
                  ],
                ),
                const SizedBox(height: 20),
                for (final p in _providers) _socialButton(p, session.busy),
              ],
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(SolarIconsBold.lockKeyhole, size: 14, color: V.trust),
                  const SizedBox(width: 6),
                  Text('Your email is never shown to anyone', style: VT.label(12, color: V.text2, weight: FontWeight.w500)),
                ],
              ),
              const SizedBox(height: 16),
              if (!ApiConfig.enabled) Text('Offline demo: nothing is sent anywhere. Run with --dart-define=VIBE_API=… to use the server.', textAlign: TextAlign.center, style: VT.body(11, color: V.muted)),
            ],
          ),
        ),
      ),
    );
  }
}
