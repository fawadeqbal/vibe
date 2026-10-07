import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_config.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import '../../providers/session_provider.dart';
import '../profile/verification_flow.dart';

enum _Check { idle, checking, ok, bad }

class _ChannelFields {
  _ChannelFields(this.platform);
  String platform;
  final url = TextEditingController();
  final followers = TextEditingController();

  void dispose() {
    url.dispose();
    followers.dispose();
  }
}

/// Apply to the creator partner program (selfie-verified accounts, once):
/// the name people see, your code (checked as you type), 1–5 channels and
/// a note. Unverified accounts see the verify step instead.
class PartnerApplyForm extends StatefulWidget {
  const PartnerApplyForm({super.key});

  @override
  State<PartnerApplyForm> createState() => _PartnerApplyFormState();
}

class _PartnerApplyFormState extends State<PartnerApplyForm> {
  late final TextEditingController _name;
  final _code = TextEditingController();
  final _note = TextEditingController();
  final List<_ChannelFields> _channels = [_ChannelFields('tiktok')];
  Map<String, String> _errors = const {};
  String? _serverError;
  bool _busy = false;
  bool _verifying = false;

  // Code availability, 400 ms after the last keystroke; a stale answer is dropped.
  Timer? _debounce;
  PartnerCodeCheck? _answer;
  String? _asked;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: context.read<SessionProvider>().me?.name ?? '');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _code.dispose();
    _note.dispose();
    for (final c in _channels) {
      c.dispose();
    }
    super.dispose();
  }

  void _onCode(String _) {
    final code = normalisePartnerCode(_code.text);
    _debounce?.cancel();
    setState(() => _errors = {..._errors}..remove('code'));
    if (code == null) return;
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      _asked = code;
      try {
        final r = await context.read<PartnerProvider>().codeAvailable(code);
        if (mounted && _asked == code && normalisePartnerCode(_code.text) == code) setState(() => _answer = r);
      } on ApiException {
        // Checked again on send.
      }
    });
  }

  (_Check, String?) get _check {
    if (_code.text.trim().isEmpty) return (_Check.idle, null);
    final code = normalisePartnerCode(_code.text);
    if (code == null) return (_Check.bad, partnerCodeReasonLabel('invalid'));
    final a = _answer;
    if (a == null || a.code != code) return (_Check.checking, null);
    return a.available ? (_Check.ok, code) : (_Check.bad, partnerCodeReasonLabel(a.reason));
  }

  PartnerApplication get _application => PartnerApplication(
        displayName: _name.text,
        code: _code.text,
        channels: [for (final c in _channels) PartnerChannelInput(platform: c.platform, url: c.url.text, followers: c.followers.text)],
        note: _note.text,
      );

  Future<void> _submit() async {
    final app = _application;
    final errs = app.errors();
    final (state, text) = _check;
    if (state == _Check.bad) errs['code'] = text!;
    setState(() {
      _errors = errs;
      _serverError = null;
    });
    if (errs.isNotEmpty) return;
    setState(() => _busy = true);
    final partner = context.read<PartnerProvider>();
    try {
      await partner.apply(app);
      if (mounted) toast(context, "Application sent. We'll let you know soon.");
    } on ApiException catch (e) {
      if (!mounted) return;
      switch (e.code) {
        case 'AFFILIATE_CODE_TAKEN':
          setState(() => _errors = {'code': partnerCodeReasonLabel(e.details['reason'] is String ? e.details['reason'] as String : 'taken')});
        case 'AFFILIATE_EXISTS':
          await partner.load();
        case 'VERIFICATION_REQUIRED':
          setState(() => _serverError = 'Verify your profile first, then apply.');
        default:
          setState(() => _serverError = e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _verifying = true);
    try {
      await startSelfieVerification(context);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verified = context.select<SessionProvider, bool>((s) => s.me?.verified == true);
    if (!verified) return Padding(padding: const EdgeInsets.only(top: 14), child: _VerifyFirst(busy: _verifying, onVerify: _verify));
    final (state, text) = _check;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Apply', top: 26),
        _label('Name people see'),
        TextField(
          key: const ValueKey('partner-name'),
          controller: _name,
          maxLength: 40,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(hintText: 'Your creator name', errorText: _errors['displayName'], counterText: ''),
        ),
        const SizedBox(height: 14),
        _label('Your code'),
        TextField(
          key: const ValueKey('partner-code'),
          controller: _code,
          maxLength: 20,
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9_]'))],
          style: VT.mono(16, color: V.text, weight: FontWeight.w600),
          onChanged: _onCode,
          decoration: InputDecoration(hintText: 'e.g. ALI', errorText: _errors['code'], counterText: ''),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
          child: SizedBox(
            height: 18,
            child: Semantics(
              liveRegion: true,
              child: switch (state) {
                _Check.checking => Row(children: [
                    const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6, color: V.muted)),
                    const SizedBox(width: 6),
                    Text('Checking…', style: VT.body(12, color: V.muted)),
                  ]),
                _Check.ok => Row(children: [
                    const Icon(SolarIconsBold.checkCircle, size: 14, color: V.trust),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text.rich(
                        TextSpan(children: [
                          TextSpan(text: 'Available · ', style: VT.body(12, color: V.text2)),
                          TextSpan(text: '${bareLink(ApiConfig.siteUrl)}/i/$text', style: VT.mono(12, color: V.text)),
                        ]),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ]),
                _Check.bad when _errors['code'] == null => Text(text!, style: VT.body(12, color: V.bad)),
                _ => const SizedBox.shrink(),
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        _label('Where you post (${_channels.length}/5)'),
        for (final (i, c) in _channels.indexed) ...[
          if (i > 0) const SizedBox(height: 10),
          _channel(i, c),
        ],
        if (_errors['channels'] != null) Padding(padding: const EdgeInsets.fromLTRB(4, 6, 4, 0), child: Text(_errors['channels']!, style: VT.body(12, color: V.bad))),
        if (_channels.length < 5)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() {
                final used = {for (final c in _channels) c.platform};
                _channels.add(_ChannelFields(partnerPlatforms.firstWhere((p) => !used.contains(p), orElse: () => 'other')));
              }),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Add another channel'),
            ),
          ),
        const SizedBox(height: 6),
        _label('Anything we should know? (optional)'),
        TextField(
          key: const ValueKey('partner-note'),
          controller: _note,
          minLines: 3,
          maxLines: 5,
          maxLength: 1000,
          decoration: InputDecoration(hintText: "Your audience, where they're from, how you'd talk about Vibe…", errorText: _errors['note']),
        ),
        if (_serverError != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_serverError!, style: VT.body(13, color: V.bad))),
        const SizedBox(height: 18),
        // The one primary action on this screen.
        GradientButton(label: 'Send application', busy: _busy, onTap: _submit),
        const SizedBox(height: 8),
        Text('One application per account. We usually reply within a few days.', textAlign: TextAlign.center, style: VT.body(11.5, color: V.muted)),
      ],
    );
  }

  Widget _label(String text) => Padding(padding: const EdgeInsets.only(left: 2, bottom: 10), child: Text(text.toUpperCase(), style: VT.overline()));

  Widget _channel(int i, _ChannelFields c) {
    return Panel(
      radius: 20,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Panel(
                  padding: EdgeInsets.zero,
                  color: V.surface2,
                  radius: 16,
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: c.platform,
                      isExpanded: true,
                      dropdownColor: V.surface2,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      borderRadius: BorderRadius.circular(14),
                      items: [for (final p in partnerPlatforms) DropdownMenuItem(value: p, child: Text(partnerSourceLabel(p), style: VT.body(15)))],
                      onChanged: (v) => setState(() => c.platform = v ?? c.platform),
                    ),
                  ),
                ),
              ),
              if (_channels.length > 1) ...[
                const SizedBox(width: 8),
                CircleIconButton(
                  icon: Icons.close_rounded,
                  iconSize: 18,
                  tooltip: 'Remove channel ${i + 1}',
                  onTap: () => setState(() {
                    _channels.removeAt(i).dispose();
                    _errors = const {};
                  }),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: ValueKey('partner-url-$i'),
            controller: c.url,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: InputDecoration(hintText: 'https://www.tiktok.com/@you', errorText: _errors['channels.$i.url']),
          ),
          const SizedBox(height: 8),
          TextField(
            key: ValueKey('partner-followers-$i'),
            controller: c.followers,
            keyboardType: TextInputType.text,
            decoration: InputDecoration(hintText: 'Followers, e.g. 25k', errorText: _errors['channels.$i.followers']),
          ),
        ],
      ),
    );
  }
}

/// Partners are real, selfie-verified people: the verify step (teal = trust).
class _VerifyFirst extends StatelessWidget {
  const _VerifyFirst({required this.busy, required this.onVerify});
  final bool busy;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context) {
    return Panel(
      border: V.trust.withValues(alpha: 0.22),
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: const Icon(SolarIconsOutline.verifiedCheck, color: V.trust),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Verify your profile first', style: VT.title(15, weight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text('Partners are real, selfie-verified people. It takes a minute.', style: VT.body(12, color: V.text2, height: 1.4)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GhostButton(
            label: busy ? 'Verifying…' : 'Verify',
            icon: SolarIconsBold.verifiedCheck,
            height: 40,
            color: V.trust,
            fill: V.trust.withValues(alpha: 0.12),
            onTap: busy ? null : onVerify,
          ),
        ],
      ),
    );
  }
}
