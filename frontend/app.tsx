import { Routes, Route } from 'react-router-dom';
import Home from './home';
import Login from './login';
import Signup from './signup';
import Congrats from './congrats';
import Profile from './profile';
import Studio from './studio';
import MySongs from './MySongs';
import Liked from './liked';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/congrats" element={<Congrats />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/my-songs" element={<MySongs />} />
      <Route path="/liked" element={<Liked />} />
      <Route path="/:username" element={<Profile />} />
    </Routes>
  );
};

export default App;

