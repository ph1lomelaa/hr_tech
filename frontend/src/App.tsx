import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { RoleProvider } from "@/context/RoleContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Index from "./pages/Index";
import GoalsPage from "./pages/GoalsPage";
import GeneratePage from "./pages/GeneratePage";
import DocumentsPage from "./pages/DocumentsPage";
import EmployeesPage from "./pages/EmployeesPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import GoalDetailPage from "./pages/GoalDetailPage";
import LandingPage from "./pages/LandingPage";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import EmployeeGoalsPage from "./pages/employee/EmployeeGoalsPage";
import EmployeeGeneratePage from "./pages/employee/EmployeeGeneratePage";
import EmployeeDocumentsPage from "./pages/employee/EmployeeDocumentsPage";
import EmployeeFeedbackPage from "./pages/employee/EmployeeFeedbackPage";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerTeamGoalsPage from "./pages/manager/ManagerTeamGoalsPage";
import ManagerMyGoalsPage from "./pages/manager/ManagerMyGoalsPage";
import ManagerGeneratePage from "./pages/manager/ManagerGeneratePage";
import ManagerDocumentsPage from "./pages/manager/ManagerDocumentsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <RoleProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route element={<DashboardLayout />}>
                {/* HR routes */}
                <Route path="/hr" element={<Index />} />
                <Route path="/hr/goals" element={<GoalsPage />} />
                <Route path="/hr/goals/:goalId" element={<GoalDetailPage />} />
                <Route path="/hr/generate" element={<GeneratePage />} />
                <Route path="/hr/documents" element={<DocumentsPage />} />
                <Route path="/hr/employees" element={<EmployeesPage />} />
                <Route path="/hr/analytics" element={<AnalyticsPage />} />

                {/* Manager routes */}
                <Route path="/manager" element={<ManagerDashboard />} />
                <Route path="/manager/team-goals" element={<ManagerTeamGoalsPage />} />
                <Route path="/manager/team-goals/:goalId" element={<ManagerTeamGoalsPage />} />
                <Route path="/manager/my-goals" element={<ManagerMyGoalsPage />} />
                <Route path="/manager/generate" element={<ManagerGeneratePage />} />
                <Route path="/manager/documents" element={<ManagerDocumentsPage />} />

                {/* Employee routes */}
                <Route path="/employee" element={<EmployeeDashboard />} />
                <Route path="/employee/goals" element={<EmployeeGoalsPage />} />
                <Route path="/employee/goals/:goalId" element={<GoalDetailPage />} />
                <Route path="/employee/generate" element={<EmployeeGeneratePage />} />
                <Route path="/employee/documents" element={<EmployeeDocumentsPage />} />
                <Route path="/employee/feedback" element={<EmployeeFeedbackPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </RoleProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
