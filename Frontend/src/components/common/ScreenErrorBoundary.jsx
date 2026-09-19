import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { ClayCard } from "./ClayCard";
import { ClayButton } from "./ClayButton";
import { useTheme } from "../../theme/clayTheme";

/**
 * Screen-level error boundary (blank-screen fix).
 *
 * A render-time exception anywhere inside a screen used to unmount React's
 * entire tree — the white/blank screen. The root causes are fixed at their
 * source; this boundary is the last-resort guard so that ANY future render
 * bug degrades into an existing-style error card (with Try Again) instead of
 * erasing the UI. It never hides the cause: the error is reported through
 * `onError` (App can toast/log it) and re-thrown into the console in dev.
 *
 * Deliberately minimal and class-based — React only supports boundaries via
 * class components. No redesign: it reuses the clay visual language.
 */
export class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface the real cause (never swallow it silently); no tokens or
    // request data pass through here — component errors only.
    console.error("[Splitzy] A screen failed to render:", error, info?.componentStack || "");
    if (this.props.onError) this.props.onError(error);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <BoundaryFallbackCard onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

function BoundaryFallbackCard({ onRetry }) {
  const { theme } = useTheme();
  return (
    <div style={{ padding: "40px 24px" }}>
      <ClayCard style={{ textAlign: "center", padding: "32px 20px" }}>
        <AlertCircle size={30} color={theme.coral} style={{ margin: "0 auto 10px" }} />
        <div style={{ fontSize: "15px", fontWeight: "700", color: theme.text }}>
          Something went wrong
        </div>
        <div style={{ fontSize: "12.5px", color: theme.muted, marginTop: "6px", marginBottom: "16px" }}>
          This screen hit an unexpected error. Try again — your data is safe.
        </div>
        <ClayButton size="sm" onClick={onRetry} icon={<RotateCcw size={14} />}>
          Try Again
        </ClayButton>
      </ClayCard>
    </div>
  );
}
