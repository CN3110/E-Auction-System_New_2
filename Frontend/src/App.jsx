import React from 'react'
import {Route, Routes} from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css';
import Login from './Components/Auth/Login';
import AdminDashboard from './Components/Admin/AdminDashboard';
import BidderDashboard from './Components/Bidder/BidderDashboard';
import { ToastContainer } from 'react-toastify';

const App = () => {
  return (
    <>
    <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover/>
    <div className='app'>
        <Routes>
            < Route path='/admindashboard' element={<AdminDashboard/>}/>
            <Route path='/bidderdashboard' element={<BidderDashboard/>}/>
            <Route path='/' element={<Login/>}/>
          

        </Routes>

    </div>
    </>
  )
}

export default App