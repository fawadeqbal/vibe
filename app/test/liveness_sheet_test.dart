import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/core/theme/vibe_widgets.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/screens/profile/verification_flow.dart';
import 'package:vibe_app/services/media/selfie_camera.dart';

/// A camera that hands out numbered frames and remembers what happened to it.
class FakeSelfieCamera implements SelfieCamera {
  FakeSelfieCamera({this.fails = false});
  final bool fails;
  int grabs = 0;
  bool closed = false;

  @override
  bool get available => true;

  @override
  Future<SelfieCameraSession> open({MediaStream? shared}) async {
    if (fails) throw StateError('no camera');
    return _FakeSession(this);
  }
}

class _FakeSession implements SelfieCameraSession {
  _FakeSession(this.cam);
  final FakeSelfieCamera cam;
  @override
  Widget preview() => const ColoredBox(color: Colors.blueGrey, key: Key('preview'));
  @override
  Future<List<int>?> grab() async => [0xFF, 0xD8, ++cam.grabs];
  @override
  Future<void> close() async => cam.closed = true;
}

void main() {
  Future<Future<VerificationState?> Function()> openSheet(WidgetTester tester, Widget sheet) async {
    // A phone-sized screen (412×892 dp), so the whole sheet is on screen.
    tester.view.physicalSize = const Size(412 * 3, 892 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    VerificationState? result;
    var done = false;
    await tester.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showVibeSheet<VerificationState>(context, scrollable: true, child: sheet);
              done = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    ));
    return () async => done ? result : null;
  }

  testWidgets('front photo, then each move after a countdown, then the result', (tester) async {
    final cam = FakeSelfieCamera();
    List<List<int>>? sentFrames;
    final result = await openSheet(
      tester,
      LivenessSheet(
        camera: cam,
        steps: const [LivenessStep.turnLeft, LivenessStep.tiltRight],
        check: (frames) async {
          sentFrames = frames;
          return const VerificationState(VerificationStatus.approved);
        },
      ),
    );
    await tester.pump();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('3 quick poses'), findsOneWidget);
    expect(find.text('Look straight at the camera, then turn your head to the left, then tilt your head to your right shoulder.'), findsOneWidget);
    expect(find.byKey(const Key('preview')), findsOneWidget);

    await tester.tap(find.text('Start'));
    await tester.pump();
    expect(find.text('Look straight at the camera'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('2'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2)); // front frame taken
    await tester.pump();
    expect(cam.grabs, 1);
    expect(find.text('Turn your head to the left'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    expect(find.text('Tilt your head to your right shoulder'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();

    expect(cam.grabs, 3);
    expect(sentFrames!.map((f) => f.last).toList(), [1, 2, 3]);
    expect((await result())!.status, VerificationStatus.approved);
    expect(find.byType(LivenessSheet), findsNothing);
    expect(cam.closed, isTrue);
  });

  testWidgets('a camera that will not open says so and offers no Start', (tester) async {
    final cam = FakeSelfieCamera(fails: true);
    await openSheet(tester, LivenessSheet(camera: cam, steps: const [LivenessStep.turnRight, LivenessStep.turnLeft], check: (_) async => VerificationState.none));
    await tester.pump();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.textContaining("Couldn't open the camera"), findsOneWidget);
    final start = tester.widget<GradientButton>(find.widgetWithText(GradientButton, 'Start'));
    expect(start.onTap, isNull);
  });

  testWidgets('a send error keeps the sheet open with the reason and a retry', (tester) async {
    final cam = FakeSelfieCamera();
    await openSheet(
      tester,
      LivenessSheet(camera: cam, steps: const [LivenessStep.turnRight, LivenessStep.tiltLeft], secondsPerStep: 1, check: (_) async => throw ApiException('RATE_LIMITED', 'Too many tries today. Try again tomorrow.', status: 429)),
    );
    await tester.pump();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start'));
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();
    expect(find.text("That didn't work"), findsOneWidget);
    expect(find.text('Too many tries today. Try again tomorrow.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  test('profile subtitle: one clean sentence, "Try again" only when the reason lacks it', () {
    String sub(String? reason) => verificationSubtitle(VerificationState(VerificationStatus.rejected, reason: reason), verified: false);
    expect(sub('Move closer so your face fills the oval.'), 'Not verified. Move closer so your face fills the oval. Try again.');
    expect(sub("We couldn't see you turn your head to the left. Follow the moves on screen and try again."),
        "Not verified. We couldn't see you turn your head to the left. Follow the moves on screen and try again.");
    expect(sub(null), 'Not verified. Try again in good light.');
  });
}
