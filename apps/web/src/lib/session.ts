'use client';
import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export const SessionContext = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
export const useSession = () => useContext(SessionContext);
