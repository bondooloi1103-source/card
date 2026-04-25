import { Toaster as ShadcnToaster } from "@/components/ui/toaster"
import { Toast as FeedbackToastRegistrar, Toaster as HotToaster } from "@/lib/feedback/Toast"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LangProvider } from '@/lib/i18n';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Home from '@/pages/Home';
import Landing from '@/pages/Landing';
import OtpLogin from '@/pages/OtpLogin';
import OtpGate from '@/components/OtpGate';
import FigureDetail from '@/pages/FigureDetail';
import MyCollection from '@/pages/MyCollection';
import GameQuoteGuess from '@/pages/GameQuoteGuess';
import LiveRoomNew from '@/pages/LiveRoomNew';
import LiveRoomEntry from '@/pages/LiveRoomEntry';
import LiveRoom from '@/pages/LiveRoom';
import StoryTour from '@/pages/StoryTour';
import ScanChat from '@/pages/ScanChat';
import DuelIntro from '@/pages/DuelIntro';
import DuelSummary from '@/pages/DuelSummary';
import Leaderboard from '@/pages/Leaderboard';
import Tournaments from '@/pages/Tournaments';
import TournamentDetail from '@/pages/TournamentDetail';
import StoryChapter from '@/pages/StoryChapter';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full border-2 border-gold/40 flex items-center justify-center mx-auto">
            <span className="text-3xl">🏇</span>
          </div>
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-crimson rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-body">Ачааллаж байна...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/otp" element={<OtpLogin />} />
      <Route path="/c/:figId" element={<ScanChat />} />
      <Route path="/app" element={<OtpGate><Home /></OtpGate>} />
      <Route path="/figure/:figId" element={<OtpGate><FigureDetail /></OtpGate>} />
      <Route path="/collection" element={<OtpGate><MyCollection /></OtpGate>} />
      <Route path="/games/quotes" element={<OtpGate><GameQuoteGuess /></OtpGate>} />
      <Route path="/games/quotes/live" element={<OtpGate><LiveRoomEntry /></OtpGate>} />
      <Route path="/games/quotes/live/new" element={<OtpGate><LiveRoomNew /></OtpGate>} />
      <Route path="/games/quotes/live/:code" element={<OtpGate><LiveRoom /></OtpGate>} />
      <Route path="/tour" element={<OtpGate><StoryTour /></OtpGate>} />
      <Route path="/story/:chapter" element={<OtpGate><StoryChapter /></OtpGate>} />
      <Route path="/story" element={<Navigate to="/#chapters" replace />} />
      <Route path="/duel/:id" element={<OtpGate><DuelIntro /></OtpGate>} />
      <Route path="/duel/:id/summary" element={<OtpGate><DuelSummary /></OtpGate>} />
      <Route path="/leaderboard" element={<OtpGate><Leaderboard /></OtpGate>} />
      <Route path="/app/tournaments" element={<OtpGate><Tournaments /></OtpGate>} />
      <Route path="/app/tournaments/:id" element={<OtpGate><TournamentDetail /></OtpGate>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <LangProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <ShadcnToaster />
          <HotToaster
            position="top-center"
            toastOptions={{
              className: 'font-prose',
              style: { background: '#0e0b07', color: '#e8d5a3', border: '1px solid rgba(201,168,76,0.4)' },
            }}
          />
          <FeedbackToastRegistrar />
        </QueryClientProvider>
      </LangProvider>
    </AuthProvider>
  )
}

export default App