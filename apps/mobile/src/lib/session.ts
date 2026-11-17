import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export const SessionContext = createContext<{ session: Session | null }>({ session: null });
export const useSession = () => useContext(SessionContext);
