import './styles/global.css'
import './index.css'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import {GoogleOAuthProvider} from '@react-oauth/google';

createRoot(document.getElementById("root")!).render(<GoogleOAuthProvider clientId='509857069478-q85n7l2cogr5muodad8mtd6g7e1isdts.apps.googleusercontent.com'><App /></GoogleOAuthProvider>);
