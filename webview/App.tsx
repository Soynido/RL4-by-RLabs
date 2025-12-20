import React, { useEffect } from 'react';
import { useStore } from './state/store';
import { dispatchMessage } from './handlers/messageRouter';
import { useKernelHydrator } from './hooks/useKernelHydrator';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useVSCodeTheme } from './hooks/useVSCodeTheme';
import { KernelReadyGate } from './components/KernelReadyGate';
import { WebViewFrame } from './components/layout/WebViewFrame';
import { Header } from './components/layout/Header';
import { TabNav } from './components/layout/TabNav';
import { Breadcrumb } from './components/layout/Breadcrumb';
import { FooterStatus } from './components/layout/FooterStatus';
import { OnboardingBanner } from './components/onboarding/OnboardingBanner';
import { SnapshotSection } from './components/control/SnapshotSection';
import { PromptPreview } from './components/control/PromptPreview';
import { AutoTasksBadge } from './components/control/AutoTasksBadge';
import { TasksSection } from './components/dev/TasksSection';
import { CapturedSession } from './components/dev/CapturedSession';
import { TrackedItems } from './components/dev/TrackedItems';
import { InsightsView } from './components/insights/InsightsView';
import { TimeMachineView } from './components/timemachine/TimeMachineView';
import { AboutView } from './components/about/AboutView';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export default function App() {
  const activeTab = useStore((s) => s.activeTab);
  const workspace = useStore((s) => s.workspace);
  const mode = useStore((s) => s.mode);
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const firstUseMode = workspace?.firstUseMode;

  // Initialize hooks
  useKernelHydrator();
  useAutoRefresh();
  useVSCodeTheme();

  // Message listener
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const { type, payload } = (event.data || {}) as any;
      if (type) {
        dispatchMessage(type, payload);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'control':
        return (
          <div className="control-view">
            {!onboardingComplete && firstUseMode && (
              <OnboardingBanner
                mode={firstUseMode}
                onDismiss={() => {
                  vscode.postMessage({ type: 'rl4:markOnboardingComplete', payload: { mode: workspace?.mode || 'new' } });
                }}
              />
            )}
            <div className="control-grid">
              <SnapshotSection />
              <PromptPreview />
            </div>
            <AutoTasksBadge />
          </div>
        );
      case 'dev':
        return (
          <div className="dev-view">
            <div className="dev-grid">
              <TasksSection />
              <CapturedSession />
            </div>
            <TrackedItems />
          </div>
        );
      case 'insights':
        return <InsightsView />;
      case 'timemachine':
        return <TimeMachineView />;
      case 'about':
        return <AboutView />;
      default:
        return null;
    }
  };

  return (
    <KernelReadyGate>
      <WebViewFrame>
        <Header />
        <div className="nav">
          <Breadcrumb activeTab={activeTab} />
          <TabNav active={activeTab} onChange={(tab) => useStore.getState().setActiveTab(tab)} />
        </div>
        <main className="content">
          {renderContent()}
        </main>
        <FooterStatus />
      </WebViewFrame>
    </KernelReadyGate>
  );
}

