import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../data/countries.dart' show allCountries, fold;
import 'vibe_theme.dart';
import 'vibe_widgets.dart';

/// One choice in a [VibeDropdown].
class DropdownOption {
  const DropdownOption(this.value, this.label, {this.leading, this.hint, this.keywords});
  final String value;
  final String label;

  /// Before the label: a flag or an emoji.
  final String? leading;

  /// Small text on the right ("You", a count).
  final String? hint;

  /// Other words that find it in the search ("UAE Dubai").
  final String? keywords;
}

/// Every country as dropdown options: the flag, the name, and other names to search by.
List<DropdownOption> countryOptions() => [for (final c in allCountries) DropdownOption(c.code, c.name, leading: c.flag, keywords: '${c.code} ${c.aka ?? ''}')];

/// Lists longer than this get a search box.
const _searchFrom = 8;

/// The app's dropdown (the web's `Dropdown`): a field-like button that opens
/// the options in a sheet. Used for every dropdown in the app, so they all
/// look and behave the same: long lists scroll inside the sheet (never taller
/// than ¾ of the screen) and get a search box (more than 8 options) that also
/// matches `keywords` and ignores accents; `suggested` values sit on top while
/// not searching; the picked one has a check and is scrolled into view.
///
/// [trigger] replaces the button for custom rows (a filter row).
class VibeDropdown extends StatelessWidget {
  const VibeDropdown({
    super.key,
    required this.value,
    required this.onChanged,
    required this.options,
    required this.label,
    this.placeholder = 'Choose…',
    this.searchPlaceholder = 'Search',
    this.searchable,
    this.suggested = const [],
    this.suggestedLabel = 'Suggested',
    this.icon,
    this.compact = false,
    this.trigger,
  });

  final String? value;
  final ValueChanged<String> onChanged;
  final List<DropdownOption> options;

  /// What it picks (screen readers, and the sheet's title).
  final String label;
  final String placeholder;
  final String searchPlaceholder;

  /// Force the search box on or off (default: on for long lists).
  final bool? searchable;
  final List<String> suggested;
  final String suggestedLabel;

  /// An icon at the start of the button.
  final IconData? icon;

  /// A filter control (44px, 14px corners) instead of a form field (48px, 18px).
  final bool compact;
  final Widget Function(BuildContext context, DropdownOption? selected, VoidCallback open)? trigger;

  Future<void> _open(BuildContext context) async {
    final picked = await showVibeSheet<String>(
      context,
      child: _DropdownSheet(
        label: label,
        options: options,
        value: value,
        suggested: suggested,
        suggestedLabel: suggestedLabel,
        searchable: searchable ?? options.length > _searchFrom,
        searchPlaceholder: searchPlaceholder,
      ),
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final selected = options.where((o) => o.value == value).firstOrNull;
    if (trigger != null) return trigger!(context, selected, () => _open(context));
    final radius = BorderRadius.circular(compact ? 14 : 18);
    return Semantics(
      button: true,
      label: '$label: ${selected?.label ?? placeholder}',
      child: Material(
        color: compact ? Colors.white.withValues(alpha: 0.04) : V.surface2,
        shape: RoundedRectangleBorder(borderRadius: radius, side: const BorderSide(color: V.line)),
        child: InkWell(
          customBorder: RoundedRectangleBorder(borderRadius: radius),
          onTap: () => _open(context),
          child: SizedBox(
            height: compact ? 44 : 48,
            child: Padding(
              padding: const EdgeInsets.only(left: 14, right: 12),
              child: Row(
                children: [
                  if (icon != null) ...[Icon(icon, size: 18, color: V.text2), const SizedBox(width: 10)],
                  if (selected?.leading != null) ...[Text(selected!.leading!, style: const TextStyle(fontSize: 17)), const SizedBox(width: 10)],
                  Expanded(
                    child: Text(
                      selected?.label ?? placeholder,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: compact ? VT.label(14, color: selected == null ? V.muted : V.text) : VT.body(15, color: selected == null ? V.muted : V.text),
                    ),
                  ),
                  const Icon(SolarIconsOutline.altArrowDown, size: 18, color: V.muted),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DropdownSheet extends StatefulWidget {
  const _DropdownSheet({
    required this.label,
    required this.options,
    required this.value,
    required this.suggested,
    required this.suggestedLabel,
    required this.searchable,
    required this.searchPlaceholder,
  });

  final String label;
  final List<DropdownOption> options;
  final String? value;
  final List<String> suggested;
  final String suggestedLabel;
  final bool searchable;
  final String searchPlaceholder;

  @override
  State<_DropdownSheet> createState() => _DropdownSheetState();
}

/// A row in the sheet: a section heading or an option.
typedef _Row = ({String? heading, DropdownOption? option});

class _DropdownSheetState extends State<_DropdownSheet> {
  static const _rowHeight = 48.0;
  static const _headingHeight = 32.0;
  String _q = '';
  late final ScrollController _scroll;

  @override
  void initState() {
    super.initState();
    // Open with the picked one in view (a little below the top).
    final rows = _rows();
    var offset = 0.0;
    for (final r in rows) {
      if (r.option != null && r.option!.value == widget.value) break;
      offset += r.heading != null ? _headingHeight : _rowHeight;
    }
    final found = rows.any((r) => r.option?.value == widget.value);
    _scroll = ScrollController(initialScrollOffset: found ? (offset - _rowHeight * 2).clamp(0, double.infinity) : 0);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  List<_Row> _rows() {
    final needle = fold(_q.trim());
    if (needle.isNotEmpty) {
      return [for (final o in widget.options) if (fold('${o.label} ${o.keywords ?? ''}').contains(needle)) (heading: null, option: o)];
    }
    final top = [for (final v in widget.suggested) ...widget.options.where((o) => o.value == v)];
    return [
      if (top.isNotEmpty) ...[
        (heading: widget.suggestedLabel, option: null),
        for (final o in top) (heading: null, option: o),
        (heading: 'All', option: null),
      ],
      for (final o in widget.options) (heading: null, option: o),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows();
    final maxHeight = MediaQuery.sizeOf(context).height * 0.75;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 8, 4),
            child: Row(
              children: [
                Expanded(child: Text(widget.label, style: VT.title(17))),
                IconButton(tooltip: 'Close', onPressed: () => Navigator.of(context).pop(), icon: const Icon(SolarIconsOutline.closeCircle, size: 22, color: V.text2)),
              ],
            ),
          ),
          if (widget.searchable)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
              child: TextField(
                onChanged: (v) => setState(() => _q = v),
                style: VT.body(15),
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: widget.searchPlaceholder,
                  isDense: true,
                  prefixIcon: const Icon(SolarIconsOutline.magnifier, size: 19, color: V.muted),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.line)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.line)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.violet)),
                  filled: true,
                  fillColor: V.surface2,
                ),
              ),
            ),
          Flexible(
            child: rows.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 28),
                    child: Text('Nothing called “${_q.trim()}”', textAlign: TextAlign.center, style: VT.body(13.5, color: V.muted)),
                  )
                : ListView.builder(
                    controller: _scroll,
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                    itemCount: rows.length,
                    itemBuilder: (context, i) {
                      final r = rows[i];
                      if (r.heading != null) {
                        return SizedBox(
                          height: _headingHeight,
                          child: Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 0), child: Text(r.heading!.toUpperCase(), style: VT.overline())),
                        );
                      }
                      final o = r.option!;
                      final on = o.value == widget.value;
                      return SizedBox(
                        height: _rowHeight,
                        child: Semantics(
                          selected: on,
                          button: true,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => Navigator.of(context).pop(o.value),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              child: Row(
                                children: [
                                  if (o.leading != null) SizedBox(width: 28, child: Text(o.leading!, style: const TextStyle(fontSize: 18))),
                                  if (o.leading != null) const SizedBox(width: 6),
                                  Expanded(child: Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(15, weight: on ? FontWeight.w600 : FontWeight.w400))),
                                  if (o.hint != null) Text(o.hint!, style: VT.label(12, color: V.muted)),
                                  if (on) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.check_rounded, size: 18, color: V.pinkSoft)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
