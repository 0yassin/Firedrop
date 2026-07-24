import { useState } from 'react';
import './App.css'
import Device from './components/device';



function App() {

  return (
    <>
      <div className='min-w-screen min-h-screen bg-[#252527] flex flex-row'>
        <div className='text-white m-12'>
          <div className=''>
            <h1 className='text-3xl mb-6'>Connected devices</h1>
            <div className='flex-col gap-2 flex ml-2'>
              <Device device_id={3} device_name='device?' />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
