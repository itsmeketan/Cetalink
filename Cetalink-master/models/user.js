const mongoose = require("mongoose");
async function main(){
    mongoose.connect("mongodb://127.0.0.1:27017/cetalink");
}
main()
.then((res)=>{
    console.log("Connection Successfull with the database");
})
.catch((error)=>{
    console.log(`Connetion unsecessfull it the error :${error}`);
});
const userSchema = new mongoose.Schema({
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
    }
    

});

const User = mongoose.model("User", userSchema);

module.exports = User; 

