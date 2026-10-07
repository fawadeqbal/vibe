import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import 'user_profile_screen.dart';

/// This week's top talkers (XP) and most gifted (gems), a podium for the
/// first three, and your own place pinned at the bottom.
class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key, this.initial = Board.xp});
  final Board initial;

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  late Board _board = widget.initial;
  final Map<Board, Leaderboard> _data = {};
  final Map<Board, String> _errors = {};

  @override
  void initState() {
    super.initState();
    _load(_board);
  }

  Future<void> _load(Board b) async {
    try {
      final lb = await context.read<EngagementProvider>().leaderboard(b);
      if (mounted) setState(() => _data[b] = lb);
    } on ApiException catch (e) {
      if (mounted) setState(() => _errors[b] = e.message);
    }
  }

  void _pick(Board b) {
    setState(() => _board = b);
    if (!_data.containsKey(b)) _load(b);
  }

  /// Rows open the profile; people you have never met have none to open.
  Future<void> _open(Profile p) async {
    ProfileView? v;
    try {
      v = await context.read<FollowsProvider>().view(p.id);
    } on ApiException catch (_) {}
    if (!mounted) return;
    if (v == null) {
      toast(context, "You haven't met yet");
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: p.id)));
  }

  String _score(int n) => _board == Board.xp ? '${Fmt.thousands(n)} XP' : Fmt.thousands(n);

  @override
  Widget build(BuildContext context) {
    final lb = _data[_board];
    final err = _errors[_board];
    return Scaffold(
      appBar: vibeAppBar(context, "This week's top"),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: Container(
              height: 44,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: V.line)),
              child: Row(children: [_tab('Top talkers', Board.xp), _tab('Most gifted', Board.gems)]),
            ),
          ),
          Expanded(
            child: lb == null
                ? (err != null ? EmptyState(icon: SolarIconsBold.cloudCross, title: 'Not available', body: err) : const Center(child: CircularProgressIndicator()))
                : lb.top.isEmpty
                    ? const EmptyState(icon: SolarIconsOutline.cupStar, title: 'Nobody ', accent: 'yet', body: 'The week just started. Have a good call to get on the board.')
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        children: [
                          _Podium(rows: lb.top.take(3).toList(), score: _score, onTap: _open, gems: _board == Board.gems),
                          const SizedBox(height: 14),
                          for (final r in lb.top.skip(3)) _Row(row: r, score: _score(r.score), gems: _board == Board.gems, onTap: () => _open(r.profile)),
                          const SizedBox(height: 10),
                          Center(child: Text('Resets Monday · bots and paused accounts are not ranked', style: VT.body(11.5, color: V.muted))),
                        ],
                      ),
          ),
          if (lb != null) _MeRow(lb: lb, score: _score(lb.myScore)),
        ],
      ),
    );
  }

  Widget _tab(String label, Board b) {
    final on = _board == b;
    return Expanded(
      child: Semantics(
        selected: on,
        button: true,
        child: GestureDetector(
          onTap: () => _pick(b),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            decoration: BoxDecoration(color: on ? V.surfaceSel : Colors.transparent, borderRadius: BorderRadius.circular(18)),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (b == Board.gems) ...[GemIcon(size: 15), const SizedBox(width: 5)] else ...[Icon(Icons.mic_rounded, size: 16, color: on ? V.level : V.muted), const SizedBox(width: 5)],
                Text(label, style: VT.label(13, color: on ? V.text : V.text2)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Podium extends StatelessWidget {
  const _Podium({required this.rows, required this.score, required this.onTap, required this.gems});
  final List<LeaderRow> rows;
  final String Function(int) score;
  final void Function(Profile) onTap;
  final bool gems;

  @override
  Widget build(BuildContext context) {
    LeaderRow? at(int rank) => rows.where((r) => r.rank == rank).firstOrNull;
    Widget spot(LeaderRow? r, double size, double lift) {
      if (r == null) return const Expanded(child: SizedBox.shrink());
      final first = r.rank == 1;
      return Expanded(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => onTap(r.profile),
          child: Padding(
            padding: EdgeInsets.only(top: lift),
            child: Column(
              children: [
                if (first) const Icon(SolarIconsBold.cupStar, color: V.warn, size: 26) else const SizedBox(height: 26),
                const SizedBox(height: 4),
                Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.bottomCenter,
                  children: [
                    VAvatar(url: r.profile.avatarUrl, name: r.profile.name, size: size, ring: first),
                    Positioned(
                      bottom: -10,
                      child: Container(
                        width: 24,
                        height: 24,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: first ? V.warn : V.surface3, border: Border.all(color: V.bg, width: 2)),
                        child: Text('${r.rank}', style: VT.number(12, color: first ? V.onGold : V.text)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(r.profile.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(14, weight: FontWeight.w600)),
                const SizedBox(height: 2),
                Row(mainAxisSize: MainAxisSize.min, children: [if (gems) ...[const GemIcon(size: 13), const SizedBox(width: 3)], Text(score(r.score), style: VT.number(12.5, color: gems ? V.gem : V.level, weight: FontWeight.w600))]),
              ],
            ),
          ),
        ),
      );
    }

    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [spot(at(2), 64, 24), spot(at(1), 84, 0), spot(at(3), 64, 32)]);
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row, required this.score, required this.onTap, required this.gems});
  final LeaderRow row;
  final String score;
  final VoidCallback onTap;
  final bool gems;

  @override
  Widget build(BuildContext context) {
    final p = row.profile;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: V.lineSoft))),
        child: Row(
          children: [
            SizedBox(width: 34, child: Text('${row.rank}', style: VT.mono(13, color: V.text2))),
            VAvatar(url: p.avatarUrl, name: p.name, size: 40),
            const SizedBox(width: 12),
            Expanded(child: Text('${p.name} ${p.country.flag}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600))),
            if (gems) ...[const GemIcon(size: 14), const SizedBox(width: 4)],
            Text(score, style: VT.number(13.5, color: gems ? V.gem : V.text, weight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// "You · #128 · 340 XP", pinned under the list.
class _MeRow extends StatelessWidget {
  const _MeRow({required this.lb, required this.score});
  final Leaderboard lb;
  final String score;

  @override
  Widget build(BuildContext context) {
    final rank = lb.myRank;
    return Container(
      decoration: const BoxDecoration(color: V.bg2, border: Border(top: BorderSide(color: V.line))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Row(
            children: [
              Container(
                height: 30,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: V.level.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(15)),
                child: Text('You', style: VT.label(13, color: V.level)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(rank == null ? 'Not ranked yet this week' : '#${Fmt.thousands(rank)}', style: VT.title(16))),
              Text(score, style: VT.number(15, color: lb.board == Board.gems ? V.gem : V.text)),
            ],
          ),
        ),
      ),
    );
  }
}
