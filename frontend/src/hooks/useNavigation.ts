import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Unified navigation hook for consistent routing behavior across the app.
 *
 * Provides common navigation actions like creating a new session,
 * ensuring consistent behavior across components.
 */
export function useNavigation() {
  const navigate = useNavigate();

  /**
   * Navigate to home page to create a new session.
   * This is the standard way to start a fresh learning session.
   */
  const handleNewSession = useCallback(() => {
    navigate("/");
  }, [navigate]);

  return {
    handleNewSession,
  };
}
