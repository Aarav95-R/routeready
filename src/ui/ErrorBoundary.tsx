import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/ui/Button";
import { body, largeTitle, MAX_DISPLAY_SCALE, subheadline } from "@/ui/type";

/**
 * The last thing between a render throw and a black screen.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which on a phone is not a stack trace — it is a blank app that stays blank
 * until the person force-quits. In development Metro draws the red box over
 * the top and that failure mode never shows itself; in TestFlight and on the
 * store it is the only failure mode there is.
 *
 * Deliberately a class. Hooks cannot catch render errors: `componentDidCatch`
 * and `getDerivedStateFromError` have no function-component equivalent, and
 * this is the one place in the app that still needs the older API.
 *
 * What it does *not* do is retry the thing that just failed. Resetting clears
 * the error and remounts the children, which is right for a transient failure
 * — a bad fix arriving mid-render, a route that raced its own data — and is a
 * loop for a deterministic one. That is a deliberate trade: a loop the person
 * can escape by closing the app beats a dead screen they cannot.
 */

type Props = {
  children: ReactNode;
  /**
   * Where a crash reporter gets wired in. Left as an injection point rather
   * than a direct Sentry import so the boundary itself stays testable and so
   * that adding reporting is a one-line change at the call site, not an edit
   * to this file.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <SafeAreaView className="flex-1 bg-field" testID="error-boundary">
        <View className="flex-1 items-center justify-center gap-3 px-8">
          {/* No apology and no error code. Neither tells the person anything
              they can act on, and this screen has exactly one job: make the
              app usable again in one tap. */}
          <Text
            maxFontSizeMultiplier={MAX_DISPLAY_SCALE}
            style={largeTitle}
            className="text-center text-label"
          >
            Something broke
          </Text>
          <Text style={body} className="pb-3 text-center text-label-secondary">
            The screen you were on stopped working. Your account, your saved routes and
            your progress are all untouched.
          </Text>

          <Button title="Back to the app" onPress={this.reset} />

          {/* The message is for us, not for them — but a person emailing about
              a crash can read it out, and that is worth more than hiding it.
              Development only would mean never seeing the one that matters. */}
          <Text
            style={subheadline}
            className="pt-6 text-center text-label-tertiary"
            numberOfLines={3}
          >
            {error.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
}
