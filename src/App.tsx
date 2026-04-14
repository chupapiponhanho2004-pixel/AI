/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChatWidget } from './components/ChatWidget';
import { InterviewRoom } from './components/InterviewRoom';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-2xl text-center space-y-6">
              <h1 className="text-5xl font-bold text-gray-900 tracking-tight">
                AI Tuyển dụng & Pháp luật
              </h1>
              <p className="text-xl text-gray-600">
                Trợ lý thông minh dành cho ứng viên và người tìm việc. 
                Tư vấn CV, phỏng vấn và giải đáp thắc mắc về Luật Lao động.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
                {[
                  { title: "Tư vấn CV", desc: "Tối ưu hóa hồ sơ năng lực" },
                  { title: "Luật Lao động", desc: "Giải đáp quyền lợi người lao động" },
                  { title: "Kỹ năng PV", desc: "Mẹo trả lời phỏng vấn tự tin" }
                ].map((feature, i) => (
                  <div key={i} className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-500">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <ChatWidget />
          </div>
        } />
        <Route path="/interview-room" element={<InterviewRoom />} />
      </Routes>
    </Router>
  );
}

