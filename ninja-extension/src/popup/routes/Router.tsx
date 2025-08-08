import { HashRouter, Routes, Route } from "react-router-dom";
import Top from "../Top";

const Router = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Top />} />
      </Routes>
    </HashRouter>
  )
}

export default Router