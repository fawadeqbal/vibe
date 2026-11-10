import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/every_minute.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';
import '../../providers/social_provider.dart';
import '../social/chat_screen.dart';
import 'user_profile_screen.dart';

// The lists behind your numbers on Me (and Recent matches → See all). Only
// you see them. Same as the web (me-lists.tsx).

/// Me → Matches: every call, newest first, more as you scroll.
class RecentMatchesScreen extends StatelessWidget {
  const RecentMatchesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: vibeAppBar(context, 'Matches'),
        body: PagedList<MatchRecord>(
          fetch: (cursor) => context.read<MatchProvider>().fetchMatches(cursor: cursor),
          empty: const EmptyState(icon: SolarIconsBold.history, title: 'No calls ', accent: 'yet', body: 'Everyone you meet on a call shows up here.'),
          row: (r) => PersonRow(
            key: ValueKey(r.id),
            person: r.partner,
            line: [Fmt.duration(r.length), Fmt.ago(r.startedAt), if (r.likedMe) 'liked you', if (r.giftsReceived > 0) '${r.giftsReceived} gift${r.giftsReceived == 1 ? '' : 's'}'].join(' · '),
            trailing: r.liked ? const Icon(SolarIconsBold.heart, size: 18, color: V.pink, semanticLabel: 'You liked them') : null,
          ),
        ),
      );
}

/// Me → Likes: everyone who liked you on a call, newest first, more as you scroll.
class LikesScreen extends StatelessWidget {
  const LikesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: vibeAppBar(context, 'Likes'),
        body: PagedList<LikeReceived>(
          fetch: (cursor) => context.read<MatchProvider>().fetchLikes(cursor: cursor),
          empty: const EmptyState(icon: SolarIconsBold.heart, title: 'No likes ', accent: 'yet', body: 'When someone taps the heart on a call with you, they show up here.'),
          row: (l) => PersonRow(person: l.profile, line: 'Liked you ${Fmt.ago(l.likedAt)}', trailing: const Icon(SolarIconsBold.heart, size: 18, color: V.pink)),
        ),
      );
}

/// Me → Friends: everyone you're friends with; message them or open their profile.
class FriendsListScreen extends StatelessWidget {
  const FriendsListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final friends = context.watch<SocialProvider>().friends;
    return Scaffold(
      appBar: vibeAppBar(context, 'Friends'),
      body: friends.isEmpty
          ? const Padding(
              padding: EdgeInsets.only(top: 60),
              child: EmptyState(icon: SolarIconsBold.usersGroupRounded, title: 'No friends ', accent: 'yet', body: 'After a good call, add them as a friend from their profile.'),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
              itemCount: friends.length,
              itemBuilder: (_, i) {
                final f = friends[i];
                // "Active 5 min ago" keeps counting.
                return EveryMinute(builder: (_) => PersonRow(
                  person: f.profile,
                  online: f.online,
                  line: Fmt.presence(f.online, f.lastSeenAt) ?? 'Friends since ${Fmt.ago(f.since)}',
                  trailing: GhostButton(
                    label: 'Message',
                    icon: SolarIconsOutline.chatRoundDots,
                    height: 34,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id))),
                  ),
                ));
              },
            ),
    );
  }
}

/// A person in one of these lists: photo, name, one line; tap for their profile.
class PersonRow extends StatelessWidget {
  const PersonRow({super.key, required this.person, required this.line, this.trailing, this.online = false});
  final Profile person;
  final String line;
  final Widget? trailing;
  final bool online;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: V.lineSoft))),
        child: Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: person.id))),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      Stack(
                        children: [
                          VAvatar(url: person.avatarUrl, name: person.name, size: 44),
                          if (online)
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: Container(
                                width: 12,
                                height: 12,
                                decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 2)),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${person.name}, ${person.age} ${person.country.flag}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600)),
                            const SizedBox(height: 1),
                            Text(line, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.text2)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      );
}

/// A cursor-paged list that loads the next page by itself near the bottom.
class PagedList<T> extends StatefulWidget {
  const PagedList({super.key, required this.fetch, required this.row, required this.empty});
  final Future<Paged<T>> Function(String? cursor) fetch;
  final Widget Function(T item) row;
  final Widget empty;

  @override
  State<PagedList<T>> createState() => _PagedListState<T>();
}

class _PagedListState<T> extends State<PagedList<T>> {
  final List<T> _items = [];
  String? _cursor;
  bool _first = true;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _more();
  }

  Future<void> _more() async {
    if (_loading || (!_first && _cursor == null)) return;
    setState(() => _loading = true);
    try {
      final page = await widget.fetch(_cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
      });
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
      _cursor = null;
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _first = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_first) return const Center(child: CircularProgressIndicator(color: V.pinkSoft));
    if (_items.isEmpty) return Padding(padding: const EdgeInsets.only(top: 60), child: Align(alignment: Alignment.topCenter, child: widget.empty));
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) _more();
        return false;
      },
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        itemCount: _items.length + (_cursor != null ? 1 : 0),
        itemBuilder: (_, i) {
          if (i < _items.length) return widget.row(_items[i]);
          // The last slot: load more when it's built (short pages never scroll).
          WidgetsBinding.instance.addPostFrameCallback((_) => _more());
          return const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: V.pinkSoft))));
        },
      ),
    );
  }
}
