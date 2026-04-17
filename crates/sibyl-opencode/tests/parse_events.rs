use sibyl_opencode::types::*;

#[test]
fn test_parse_message_part_updated_text() {
    let json = r#"{"type":"message.part.updated","properties":{"sessionID":"ses_test","part":{"type":"text","text":"Hi!","time":{"start":123,"end":456},"id":"prt_test","messageID":"msg_test","sessionID":"ses_test"},"time":789}}"#;
    
    let event: OpenCodeEvent = serde_json::from_str(json).unwrap();
    match event {
        OpenCodeEvent::MessagePartUpdated { properties } => {
            match properties.part {
                Part::Text { id, text, time, .. } => {
                    assert_eq!(id, "prt_test");
                    assert_eq!(text, "Hi!");
                    assert!(time.is_some());
                    assert!(time.unwrap().end.is_some());
                }
                _ => panic!("Expected Text part"),
            }
        }
        _ => panic!("Expected MessagePartUpdated"),
    }
}

#[test]
fn test_parse_message_part_delta() {
    let json = r#"{"type":"message.part.delta","properties":{"sessionID":"ses_test","messageID":"msg_test","partID":"prt_test","field":"text","delta":"Hi!"}}"#;
    
    let event: OpenCodeEvent = serde_json::from_str(json).unwrap();
    match event {
        OpenCodeEvent::MessagePartDelta { properties } => {
            assert_eq!(properties.session_id, "ses_test");
            assert_eq!(properties.message_id, "msg_test");
            assert_eq!(properties.part_id, "prt_test");
            assert_eq!(properties.delta, "Hi!");
        }
        _ => panic!("Expected MessagePartDelta"),
    }
}

#[test]
fn test_parse_session_idle() {
    let json = r#"{"type":"session.idle","properties":{"sessionID":"ses_test"}}"#;
    
    let event: OpenCodeEvent = serde_json::from_str(json).unwrap();
    match event {
        OpenCodeEvent::SessionIdle { properties } => {
            assert_eq!(properties.session_id, "ses_test");
        }
        _ => panic!("Expected SessionIdle"),
    }
}

#[test]
fn test_parse_real_sse_event() {
    let json = r#"{"type":"message.part.delta","properties":{"sessionID":"ses_2633d4f7fffeE6RnWW6hdj2QbD","messageID":"msg_d9cc32dee001u42dEneFMs7WNS","partID":"prt_d9cc3410f0012OnKHH2SM0Bqkj","field":"text","delta":"Hi"}}"#;
    
    let event: OpenCodeEvent = serde_json::from_str(json).unwrap();
    match event {
        OpenCodeEvent::MessagePartDelta { properties } => {
            assert_eq!(properties.delta, "Hi");
            println!("Successfully parsed delta event with delta: {}", properties.delta);
        }
        _ => panic!("Expected MessagePartDelta"),
    }
}

#[test]
fn test_parse_real_message_part_updated() {
    let json = r#"{"type":"message.part.updated","properties":{"sessionID":"ses_2633d4f7fffeE6RnWW6hdj2QbD","part":{"id":"prt_d9cc3410f0012OnKHH2SM0Bqkj","messageID":"msg_d9cc32dee001u42dEneFMs7WNS","sessionID":"ses_2633d4f7fffeE6RnWW6hdj2QbD","type":"text","text":"Hi!","time":{"start":1776451535119,"end":1776451535161}},"time":1776451535162}}"#;
    
    let event: OpenCodeEvent = serde_json::from_str(json).unwrap();
    match event {
        OpenCodeEvent::MessagePartUpdated { properties } => {
            match properties.part {
                Part::Text { text, time, .. } => {
                    assert_eq!(text, "Hi!");
                    assert!(time.is_some());
                    let t = time.unwrap();
                    assert!(t.end.is_some());
                    println!("Successfully parsed message.part.updated with text: {}, end time: {}", text, t.end.unwrap());
                }
                _ => panic!("Expected Text part"),
            }
        }
        _ => panic!("Expected MessagePartUpdated"),
    }
}