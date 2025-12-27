import axios from 'axios';

const SCHEDULER_URL = 'http://localhost:4003/api/v1/scheduling';
const VIDEO_URL = 'http://localhost:4004/api/v1/video';

async function testAuth() {
  console.log('Testing Service-to-Service Authentication...');

  const meetingId = 'ef59a762-f449-4276-9e4b-77c5906f605b';
  const userId = 'e21f2003-54d7-4fcf-be52-669a60436f9a';

  // 1. Test Scheduler Integration (used by Video Service)
  try {
    console.log(`\n1. Testing GET ${SCHEDULER_URL}/meetings/${meetingId} with service headers...`);
    const resp = await axios.get(`${SCHEDULER_URL}/meetings/${meetingId}`, {
      headers: {
        'X-Service': 'video-service',
        'X-User-ID': userId
      }
    });
    console.log('✅ Success! Scheduler accepted internal service request.');
  } catch (err) {
    console.error('❌ Failed! Scheduler rejected internal service request:', err.response?.status, err.response?.data);
  }

  // 2. Test Video Integration (used by Scheduler Service)
  try {
    console.log(`\n2. Testing POST ${VIDEO_URL}/rooms with service headers...`);
    const resp = await axios.post(`${VIDEO_URL}/rooms`, {
      meetingId,
      maxParticipants: 2,
      roomSettings: { audioEnabled: true, videoEnabled: true }
    }, {
      headers: {
        'X-Service': 'scheduler-service',
        'X-User-ID': userId
      }
    });
    console.log('✅ Success! Video Service accepted internal service request.');
  } catch (err) {
    console.error('❌ Failed! Video Service rejected internal service request:', err.response?.status, err.response?.data);
  }

  // 3. Test Security (Should fail without headers)
  try {
    console.log(`\n3. Testing GET ${SCHEDULER_URL}/meetings/${meetingId} WITHOUT headers (Should fail)...`);
    await axios.get(`${SCHEDULER_URL}/meetings/${meetingId}`);
    console.log('❌ Failed! Security breach: Endpoint accessible without auth.');
  } catch (err) {
    console.log('✅ Success! Endpoint correctly rejected unauthorized request:', err.response?.status);
  }
}

testAuth();
