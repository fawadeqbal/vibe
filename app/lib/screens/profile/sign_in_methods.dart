import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_config.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/payments.dart';
import '../../providers/session_provider.dart';
import '../../services/app_services.dart';
import '../../services/auth/social_sign_in.dart';

/// Profile → Sign-in methods: the e-mail, linked Google/Apple/Facebook,
/// link another, unlink (the server refuses to remove the last one).
class SignInMethodsCard extends StatefulWidget {
  const SignInMethodsCard({super.key});

  @override
  State<SignInMethodsCard> createState() => _SignInMethodsCardState();
}

class _SignInMethodsCardState extends State<SignInMethodsCard> {
  IdentitiesView? _view;
  String? _busy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final v = await context.read<SessionProvider>().identities();
      if (mounted) setState(() => _view = v);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _run(String provider, Future<IdentitiesView?> Function() fn, {String? done}) async {
    setState(() => _busy = provider);
    try {
      final v = await fn();
      if (v != null && mounted) {
        setState(() => _view = v);
        if (done != null) toast(context, done);
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } on SocialSignInException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _link(String provider) => _run(provider, () async {
        final session = context.read<SessionProvider>();
        final social = context.read<AppServices>().social;
        final cred = ApiConfig.enabled ? await social.signIn(provider) : SocialCredential(provider: provider);
        if (cred == null) return null;
        return session.linkIdentity(cred);
      }, done: '${socialProviderLabel(provider)} linked');

  Future<void> _unlink(String provider) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Unlink ${socialProviderLabel(provider)}?'),
        content: const Text('You will no longer be able to sign in with it. You can link it again later.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Unlink', style: TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final session = context.read<SessionProvider>();
    await _run(provider, () => session.unlinkIdentity(provider), done: '${socialProviderLabel(provider)} unlinked');
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    if (v == null) {
      return GroupCard(children: [
        GroupRow(bare: true, icon: Icons.key_rounded, title: 'Sign-in methods', subtitle: _error ?? 'Loading…', trailing: _error != null ? TextButton(onPressed: _load, child: const Text('Retry')) : null),
      ]);
    }
    final social = context.read<AppServices>().social;
    bool canLink(String p) => v.available.contains(p) && (!ApiConfig.enabled || social.canUse(p) || social.allowsDev);
    final providers = [for (final p in const ['google', 'apple', 'facebook']) if (v.isLinked(p) || canLink(p)) p];
    return GroupCard(
      dividerInset: 52,
      children: [
        if (v.email != null) GroupRow(bare: true, icon: Icons.mail_outline_rounded, title: 'E-mail code', subtitle: v.email),
        for (final p in providers) _row(v, p, canLink(p)),
        if (v.email == null && providers.isEmpty) GroupRow(bare: true, icon: Icons.key_rounded, title: 'No other sign-in methods available'),
      ],
    );
  }

  Widget _row(IdentitiesView v, String p, bool canLink) {
    final linked = v.identities.where((i) => i.provider == p).firstOrNull;
    final icon = switch (p) {
      'google' => Icons.g_mobiledata_rounded,
      'apple' => Icons.apple,
      _ => Icons.facebook_rounded,
    };
    final busy = _busy == p;
    return GroupRow(
      bare: true,
      icon: icon,
      title: socialProviderLabel(p),
      subtitle: linked == null ? 'Not linked' : (linked.email ?? 'Linked'),
      trailing: busy
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: V.text2))
          : linked != null
              ? TextButton(onPressed: _busy == null ? () => _unlink(p) : null, child: Text('Unlink', style: VT.label(13, color: V.bad)))
              : TextButton(onPressed: _busy == null && canLink ? () => _link(p) : null, child: Text('Link', style: VT.label(13, color: V.pinkSoft))),
    );
  }
}
